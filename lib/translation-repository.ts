import { uniriseSchema as schema } from '../db/schema';
import type { AdminIdentity } from './admin-auth';
import {
  ContentConflictError,
  ContentValidationError,
} from './content-repository';
import type { Locale } from './locales';
import {
  RESOURCE_TYPES,
  validateResourceReference,
  validateSourcePayload,
  validateTranslationPayload,
  type CanonicalSource,
  type ResourceType,
  type SourceReference,
  type TranslationPayload,
  type TranslationRecord,
  type TranslationOrigin,
  type TranslationStatus,
  type TranslationJob,
  type TranslationJobItem,
  type TranslationItemState,
} from './translation-types';

const sourceTables: Record<ResourceType, string> = {
  news: schema.managedNews,
  download: schema.managedDownloads,
  knowledge: schema.chatKnowledge,
  public_content: schema.publicContent,
};
type SourceRow = {
  id: string;
  source_version: number;
  status: CanonicalSource['status'];
  payload_json: string;
  title: string;
  lead: string;
  highlights_json: string;
  legacy_id: string;
  image_url: string;
  video_url: string | null;
  body: string;
  tags_json: string;
  href: string;
};
type TranslationRow = {
  id: string;
  resource_type: ResourceType;
  resource_id: string;
  source_version: number;
  locale: TranslationRecord['locale'];
  payload_json: string;
  status: TranslationStatus;
  origin: TranslationOrigin;
  outdated: number;
  failure_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  translated_at: string;
  updated_at: string;
};
type JobRow = {
  id: string;
  request_key: string;
  locale: TranslationJob['locale'];
  state: TranslationJob['state'];
  requested_by: string;
  created_at: string;
  updated_at: string;
};
type ItemRow = {
  id: string;
  job_id: string;
  resource_type: ResourceType;
  resource_id: string;
  source_version: number;
  source_payload_json: string;
  state: TranslationItemState;
  attempts: number;
  claim_token: string | null;
  lease_expires_at: string | null;
  failure_reason: string | null;
  attempt_history_json: string;
};
const timestamp = () => new Date().toISOString();
function reference(resourceType: ResourceType, resourceId: string) {
  validateResourceReference({ resourceType, resourceId, sourceVersion: 1 });
  return sourceTables[resourceType];
}
function boundedId(value: string) {
  if (typeof value !== 'string' || !/^[\w.-]{1,160}$/.test(value))
    throw new ContentValidationError('invalid operation ID');
  return value;
}
function translationStatus(value: TranslationStatus) {
  if (!['draft', 'needs_review', 'published'].includes(value))
    throw new ContentValidationError('invalid translation status');
  return value;
}
function failureCode(value?: string) {
  if (!value || !/^[a-zA-Z0-9_.-]{1,120}$/.test(value))
    throw new ContentValidationError(
      'failure reason must be a safe error code',
    );
  return value;
}
function audit(
  db: D1Database,
  actor: AdminIdentity,
  action: string,
  ref: SourceReference,
  detail: object,
  now: string,
) {
  return db
    .prepare(`INSERT INTO ${schema.adminAuditLog} (id, admin_user_id, action, target_type, target_id, detail_json, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0`)
    .bind(
      crypto.randomUUID(),
      actor.id,
      action,
      ref.resourceType,
      ref.resourceId,
      JSON.stringify(detail),
      now,
    );
}
async function batch<T = Record<string, unknown>>(
  db: D1Database,
  statements: D1PreparedStatement[],
) {
  const results = await db.batch<T>(statements);
  if (results.some((result) => !result.success))
    throw new Error('database operation failed');
  return results;
}
async function commit(
  db: D1Database,
  write: D1PreparedStatement,
  log: D1PreparedStatement,
  check = db.prepare('SELECT changes() AS primary_changes'),
) {
  // D1 metadata includes trigger writes. This SELECT captures the primary
  // write count without changing changes(), which the audit guard also uses.
  const [, signal] = await batch<{
    primary_changes: number;
    replay_valid?: number;
  }>(db, [write, check, log]);
  const row = signal.results[0];
  if (row?.primary_changes !== 1 && row?.replay_valid !== 1)
    throw new ContentConflictError();
}

function sourceFromRow(
  resourceType: ResourceType,
  row: SourceRow,
): CanonicalSource {
  const ref = {
    resourceType,
    resourceId: row.id as string,
    sourceVersion: row.source_version as number,
  };
  const payload =
    resourceType === 'public_content'
      ? JSON.parse(row.payload_json)
      : resourceType === 'news'
        ? {
            kind: 'news',
            text: {
              title: row.title,
              lead: row.lead,
              highlights: JSON.parse(row.highlights_json),
            },
            literals: {
              legacyId: row.legacy_id,
              imageUrl: row.image_url,
              videoUrl: row.video_url,
            },
          }
        : resourceType === 'download'
          ? {
              kind: 'download',
              text: { title: row.title },
              literals: { legacyId: row.legacy_id },
            }
          : {
              kind: 'knowledge',
              text: {
                title: row.title,
                body: row.body,
                tags: JSON.parse(row.tags_json),
              },
              literals: { href: row.href },
            };
  return {
    ...ref,
    status: row.status,
    payload: validateSourcePayload(payload, ref),
  };
}

export async function getCanonicalSource(
  db: D1Database,
  resourceType: ResourceType,
  resourceId: string,
): Promise<CanonicalSource | null> {
  const table = reference(resourceType, resourceId);
  const row = await db
    .prepare(`SELECT * FROM ${table} WHERE id = ?`)
    .bind(resourceId)
    .first<SourceRow>();
  return row ? sourceFromRow(resourceType, row) : null;
}

/** A stable order makes saved batches reproducible across isolates. */
export async function enumerateSources(
  db: D1Database,
  options: { includeDrafts?: boolean } = {},
): Promise<CanonicalSource[]> {
  const sources: CanonicalSource[] = [];
  for (const resourceType of RESOURCE_TYPES) {
    const rows = await db
      .prepare(
        `SELECT * FROM ${sourceTables[resourceType]} ${options.includeDrafts ? '' : "WHERE status = 'published'"} ORDER BY id`,
      )
      .all<SourceRow>();
    sources.push(
      ...rows.results.map((row) => sourceFromRow(resourceType, row)),
    );
  }
  return sources;
}

function translationFromRow(row: TranslationRow): TranslationRecord {
  const ref = {
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    sourceVersion: row.source_version,
  };
  return {
    ...ref,
    id: row.id,
    locale: row.locale,
    payload: validateSourcePayload(JSON.parse(row.payload_json), ref),
    status: row.status,
    origin: row.origin,
    outdated: row.outdated === 1,
    failureReason: row.failure_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    translatedAt: row.translated_at,
    updatedAt: row.updated_at,
  };
}

export async function getTranslation(
  db: D1Database,
  resourceType: ResourceType,
  resourceId: string,
): Promise<TranslationRecord | null> {
  reference(resourceType, resourceId);
  const row = await db
    .prepare(
      `SELECT * FROM ${schema.contentTranslations} WHERE resource_type = ? AND resource_id = ? AND locale = 'en'`,
    )
    .bind(resourceType, resourceId)
    .first<TranslationRow>();
  return row ? translationFromRow(row) : null;
}

export type LocalizedContent = {
  source: CanonicalSource;
  requestedLocale: Locale;
  locale: Locale;
  payload: TranslationPayload | null;
  missing: boolean;
  outdated: boolean;
  translation: Pick<
    TranslationRecord,
    'status' | 'sourceVersion' | 'origin' | 'translatedAt'
  > | null;
};
export async function getLocalizedContent(
  db: D1Database,
  resourceType: ResourceType,
  resourceId: string,
  locale: Locale,
  options: { fallback?: boolean } = {},
): Promise<LocalizedContent | null> {
  if (locale !== 'zh-TW' && locale !== 'en')
    throw new ContentValidationError('invalid locale');
  const source = await getCanonicalSource(db, resourceType, resourceId);
  if (!source || source.status !== 'published') return null;
  if (locale === 'zh-TW')
    return {
      source,
      requestedLocale: locale,
      locale,
      payload: source.payload,
      missing: false,
      outdated: false,
      translation: null,
    };
  let translation: TranslationRecord | null = null;
  try {
    translation = await getTranslation(db, resourceType, resourceId);
  } catch (error) {
    if (
      !(error instanceof ContentValidationError) &&
      !(error instanceof SyntaxError)
    )
      throw error;
  }
  if (translation && translation.status !== 'draft') {
    try {
      // Outdated English prose stays public, but changed literal links must not
      // send readers to old assets or products. Those use the explicit fallback.
      validateTranslationPayload(translation.payload, {
        ...source,
        payload: {
          ...translation.payload,
          literals: source.payload.literals,
        } as TranslationPayload,
      });
      const { status, sourceVersion, origin, translatedAt } = translation;
      return {
        source,
        requestedLocale: locale,
        locale,
        payload: translation.payload,
        missing: false,
        outdated:
          translation.outdated ||
          translation.sourceVersion !== source.sourceVersion,
        translation: { status, sourceVersion, origin, translatedAt },
      };
    } catch (error) {
      if (!(error instanceof ContentValidationError)) throw error;
    }
  }
  return {
    source,
    requestedLocale: locale,
    locale: 'zh-TW',
    payload: options.fallback === false ? null : source.payload,
    missing: true,
    outdated: translation?.outdated ?? false,
    translation: null,
  };
}

export async function updateCanonicalSource(
  db: D1Database,
  input: SourceReference & { payload: TranslationPayload },
  actor: AdminIdentity,
) {
  const payload = validateSourcePayload(input.payload, input);
  const table = sourceTables[input.resourceType];
  const now = timestamp();
  let fields: string;
  let values: (string | number | null)[];
  if (payload.kind === 'news') {
    fields =
      'title = ?, lead = ?, highlights_json = ?, legacy_id = ?, image_url = ?, video_url = ?';
    values = [
      payload.text.title,
      payload.text.lead,
      JSON.stringify(payload.text.highlights),
      payload.literals.legacyId,
      payload.literals.imageUrl,
      payload.literals.videoUrl,
    ];
  } else if (payload.kind === 'download') {
    fields = 'title = ?, legacy_id = ?';
    values = [payload.text.title, payload.literals.legacyId];
  } else if (payload.kind === 'knowledge') {
    fields = 'title = ?, body = ?, tags_json = ?, href = ?';
    values = [
      payload.text.title,
      payload.text.body,
      JSON.stringify(payload.text.tags),
      payload.literals.href,
    ];
  } else {
    fields = 'payload_json = ?';
    values = [JSON.stringify(payload)];
  }
  await commit(
    db,
    db
      .prepare(
        `UPDATE ${table} SET ${fields}, source_version = source_version + 1, updated_at = ? WHERE id = ? AND source_version = ?`,
      )
      .bind(...values, now, input.resourceId, input.sourceVersion),
    audit(
      db,
      actor,
      'source.updated',
      input,
      { sourceVersion: input.sourceVersion + 1 },
      now,
    ),
  );
  return getCanonicalSource(db, input.resourceType, input.resourceId);
}

export type TranslationInput = SourceReference & {
  payload: TranslationPayload;
  status: TranslationStatus;
  origin: TranslationOrigin;
  claim?: { itemId: string; token: string };
};
export async function saveTranslation(
  db: D1Database,
  input: TranslationInput,
  actor: AdminIdentity,
) {
  validateResourceReference(input);
  translationStatus(input.status);
  if (input.origin !== 'ai' && input.origin !== 'human')
    throw new ContentValidationError('invalid translation origin');
  if (input.origin === 'ai' && input.status !== 'needs_review')
    throw new ContentValidationError('AI output must need review');
  const source = await getCanonicalSource(
    db,
    input.resourceType,
    input.resourceId,
  );
  if (!source || source.sourceVersion !== input.sourceVersion)
    throw new ContentConflictError();
  const payload = validateTranslationPayload(input.payload, source);
  const existing = await getTranslation(
    db,
    input.resourceType,
    input.resourceId,
  );
  if (input.origin === 'ai' && existing?.origin === 'human')
    throw new ContentValidationError('human translation is protected');
  const now = timestamp();
  const reviewed = input.origin === 'human' && input.status === 'published';
  if (input.claim) {
    boundedId(input.claim.itemId);
    boundedId(input.claim.token);
  }
  const payloadJson = JSON.stringify(payload);
  const write = db
    .prepare(`INSERT INTO ${schema.contentTranslations}
    (id, resource_type, resource_id, locale, payload_json, status, source_version, origin, outdated, failure_reason, reviewed_by, reviewed_at, translated_at, updated_at)
    SELECT ?, ?, ?, 'en', ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?
    FROM ${sourceTables[input.resourceType]} WHERE id = ? AND source_version = ?
      AND (? IS NULL OR EXISTS (SELECT 1 FROM ${schema.translationJobItems}
        WHERE id = ? AND claim_token = ? AND state = 'running' AND lease_expires_at > ?
          AND resource_type = ? AND resource_id = ? AND source_version = ?))
    ON CONFLICT(resource_type, resource_id, locale) DO UPDATE SET
      payload_json = excluded.payload_json, status = excluded.status, source_version = excluded.source_version,
      origin = excluded.origin, outdated = 0, failure_reason = NULL, reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at, translated_at = excluded.translated_at, updated_at = excluded.updated_at
    WHERE (${schema.contentTranslations}.origin = 'ai' OR excluded.origin = 'human')
      AND ${schema.contentTranslations}.updated_at IS ? AND ${schema.contentTranslations}.payload_json IS ?
      AND (${schema.contentTranslations}.payload_json IS NOT excluded.payload_json
        OR ${schema.contentTranslations}.status <> excluded.status
        OR ${schema.contentTranslations}.source_version <> excluded.source_version
        OR ${schema.contentTranslations}.origin <> excluded.origin
        OR ${schema.contentTranslations}.outdated <> 0
        OR ${schema.contentTranslations}.failure_reason IS NOT NULL)`)
    .bind(
      crypto.randomUUID(),
      input.resourceType,
      input.resourceId,
      payloadJson,
      input.status,
      input.sourceVersion,
      input.origin,
      reviewed ? actor.id : null,
      reviewed ? now : null,
      now,
      now,
      input.resourceId,
      input.sourceVersion,
      input.claim?.itemId ?? null,
      input.claim?.itemId ?? null,
      input.claim?.token ?? null,
      now,
      input.resourceType,
      input.resourceId,
      input.sourceVersion,
      existing?.updatedAt ?? null,
      existing ? JSON.stringify(existing.payload) : null,
    );
  await commit(
    db,
    write,
    audit(
      db,
      actor,
      'translation.saved',
      input,
      {
        status: input.status,
        origin: input.origin,
        sourceVersion: input.sourceVersion,
      },
      now,
    ),
    db
      .prepare(`SELECT changes() AS primary_changes, EXISTS (
      SELECT 1 FROM ${schema.contentTranslations} t
      JOIN ${sourceTables[input.resourceType]} s ON s.id = t.resource_id
      WHERE t.resource_type = ? AND t.resource_id = ? AND t.locale = 'en'
        AND t.payload_json = ? AND t.status = ? AND t.source_version = ? AND t.origin = ?
        AND t.outdated = 0 AND t.failure_reason IS NULL AND s.source_version = ?
        AND (? IS NULL OR EXISTS (SELECT 1 FROM ${schema.translationJobItems}
          WHERE id = ? AND claim_token = ? AND state = 'running' AND lease_expires_at > ?
            AND resource_type = ? AND resource_id = ? AND source_version = ?))
    ) AS replay_valid`)
      .bind(
        input.resourceType,
        input.resourceId,
        payloadJson,
        input.status,
        input.sourceVersion,
        input.origin,
        input.sourceVersion,
        input.claim?.itemId ?? null,
        input.claim?.itemId ?? null,
        input.claim?.token ?? null,
        now,
        input.resourceType,
        input.resourceId,
        input.sourceVersion,
      ),
  );
  return getTranslation(db, input.resourceType, input.resourceId);
}

export async function setTranslationPublication(
  db: D1Database,
  resourceType: ResourceType,
  resourceId: string,
  status: TranslationStatus,
  actor: AdminIdentity,
) {
  reference(resourceType, resourceId);
  translationStatus(status);
  const existing = await getTranslation(db, resourceType, resourceId);
  if (!existing) throw new ContentValidationError('translation was not found');
  const now = timestamp();
  await commit(
    db,
    db
      .prepare(`UPDATE ${schema.contentTranslations} SET status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ? AND updated_at = ? AND payload_json = ? AND status <> ?
      AND (? <> 'published' OR EXISTS (SELECT 1 FROM ${sourceTables[resourceType]} WHERE id = ? AND source_version = ?))`)
      .bind(
        status,
        status === 'published' ? actor.id : null,
        status === 'published' ? now : null,
        now,
        existing.id,
        existing.updatedAt,
        JSON.stringify(existing.payload),
        status,
        status,
        resourceId,
        existing.sourceVersion,
      ),
    audit(db, actor, `translation.${status}`, existing, { status }, now),
    db
      .prepare(`SELECT changes() AS primary_changes, EXISTS (
      SELECT 1 FROM ${schema.contentTranslations}
      WHERE id = ? AND status = ? AND source_version = ? AND payload_json = ?
        AND (? <> 'published' OR EXISTS (SELECT 1 FROM ${sourceTables[resourceType]}
          WHERE id = ? AND source_version = ?))
    ) AS replay_valid`)
      .bind(
        existing.id,
        status,
        existing.sourceVersion,
        JSON.stringify(existing.payload),
        status,
        resourceId,
        existing.sourceVersion,
      ),
  );
}

function jobFromRow(row: JobRow): TranslationJob {
  return {
    id: row.id,
    requestKey: row.request_key,
    locale: row.locale,
    state: row.state,
    requestedBy: row.requested_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export async function getTranslationJob(
  db: D1Database,
  id: string,
): Promise<TranslationJob | null> {
  const row = await db
    .prepare(`SELECT * FROM ${schema.translationJobs} WHERE id = ?`)
    .bind(boundedId(id))
    .first<JobRow>();
  return row ? jobFromRow(row) : null;
}
function itemFromRow(row: ItemRow): TranslationJobItem {
  return {
    id: row.id,
    jobId: row.job_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    sourceVersion: row.source_version,
    sourcePayload: JSON.parse(row.source_payload_json),
    state: row.state,
    attempts: row.attempts,
    claimToken: row.claim_token,
    leaseExpiresAt: row.lease_expires_at,
    failureReason: row.failure_reason,
    history: JSON.parse(row.attempt_history_json),
  };
}
export async function listTranslationJobItems(
  db: D1Database,
  jobId: string,
): Promise<TranslationJobItem[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM ${schema.translationJobItems} WHERE job_id = ? ORDER BY resource_type, resource_id, source_version`,
    )
    .bind(boundedId(jobId))
    .all<ItemRow>();
  return rows.results.map(itemFromRow);
}
function refreshJob(db: D1Database, jobId: string, now: string) {
  return db
    .prepare(`UPDATE ${schema.translationJobs} SET state = CASE
    WHEN EXISTS (SELECT 1 FROM ${schema.translationJobItems} WHERE job_id = ? AND state = 'running') THEN 'running'
    WHEN EXISTS (SELECT 1 FROM ${schema.translationJobItems} WHERE job_id = ? AND state = 'pending') THEN 'pending'
    WHEN EXISTS (SELECT 1 FROM ${schema.translationJobItems} WHERE job_id = ? AND state = 'failed') THEN 'failed'
    ELSE 'completed' END, updated_at = ? WHERE id = ?`)
    .bind(jobId, jobId, jobId, now, jobId);
}

export async function createTranslationJob(
  db: D1Database,
  requestKey: string,
  actor: AdminIdentity,
  requestedSources?: SourceReference[],
): Promise<TranslationJob> {
  boundedId(requestKey);
  const existing = await db
    .prepare(`SELECT * FROM ${schema.translationJobs} WHERE request_key = ?`)
    .bind(requestKey)
    .first<JobRow>();
  if (existing) return jobFromRow(existing);
  if (requestedSources && requestedSources.length > 500)
    throw new ContentValidationError('batch is too large');
  const candidates: CanonicalSource[] = [];
  if (requestedSources) {
    for (const ref of requestedSources) {
      validateResourceReference(ref);
      const source = await getCanonicalSource(
        db,
        ref.resourceType,
        ref.resourceId,
      );
      if (
        !source ||
        source.status !== 'published' ||
        source.sourceVersion !== ref.sourceVersion
      )
        throw new ContentConflictError();
      candidates.push(source);
    }
  } else candidates.push(...(await enumerateSources(db)));
  const sources: CanonicalSource[] = [];
  const seen = new Set<string>();
  for (const source of candidates) {
    const key = `${source.resourceType}:${source.resourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const translated = await getTranslation(
      db,
      source.resourceType,
      source.resourceId,
    );
    if (
      translated?.origin === 'human' ||
      (!requestedSources &&
        translated &&
        translated.sourceVersion === source.sourceVersion &&
        !translated.outdated)
    )
      continue;
    sources.push(source);
  }
  sources.sort(
    (a, b) =>
      a.resourceType.localeCompare(b.resourceType) ||
      a.resourceId.localeCompare(b.resourceId),
  );
  if (sources.length > 500)
    throw new ContentValidationError(
      'batch is too large; select up to 500 resources',
    );
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const now = timestamp();
  const statements = [
    db
      .prepare(
        `INSERT OR IGNORE INTO ${schema.translationJobs} (id, request_key, creation_token, requested_by, request_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        requestKey,
        token,
        actor.id,
        JSON.stringify(
          sources.map(({ resourceType, resourceId, sourceVersion }) => ({
            resourceType,
            resourceId,
            sourceVersion,
          })),
        ),
        now,
        now,
      ),
  ];
  for (const source of sources)
    statements.push(
      db
        .prepare(`INSERT OR IGNORE INTO ${schema.translationJobItems} (id, job_id, resource_type, resource_id, source_version, source_payload_json)
    SELECT ?, id, ?, ?, ?, ? FROM ${schema.translationJobs} WHERE request_key = ? AND creation_token = ?`)
        .bind(
          crypto.randomUUID(),
          source.resourceType,
          source.resourceId,
          source.sourceVersion,
          JSON.stringify(source.payload),
          requestKey,
          token,
        ),
    );
  statements.push(refreshJob(db, id, now));
  await batch(db, statements);
  const saved = await db
    .prepare(`SELECT * FROM ${schema.translationJobs} WHERE request_key = ?`)
    .bind(requestKey)
    .first<JobRow>();
  if (!saved) throw new Error('translation job was not saved');
  return jobFromRow(saved);
}

async function findItem(db: D1Database, id: string) {
  return db
    .prepare(`SELECT * FROM ${schema.translationJobItems} WHERE id = ?`)
    .bind(boundedId(id))
    .first<ItemRow>();
}
export async function claimTranslationJobItem(
  db: D1Database,
  id: string,
  options: { now?: string; leaseSeconds?: number } = {},
): Promise<TranslationJobItem | null> {
  const now = options.now ?? timestamp();
  const seconds = options.leaseSeconds ?? 120;
  if (
    !Number.isInteger(seconds) ||
    seconds < 10 ||
    seconds > 3600 ||
    !Number.isFinite(Date.parse(now))
  )
    throw new ContentValidationError('invalid claim lease');
  const item = await findItem(db, id);
  if (!item) return null;
  const token = crypto.randomUUID();
  const expires = new Date(Date.parse(now) + seconds * 1000).toISOString();
  const [result] = await batch(db, [
    db
      .prepare(`UPDATE ${schema.translationJobItems} SET
    attempt_history_json = json_insert(CASE WHEN state = 'running' THEN json_insert(attempt_history_json, '$[#]', json_object('attempt', attempts, 'state', 'lease_expired', 'at', ?)) ELSE attempt_history_json END,
      '$[#]', json_object('attempt', attempts + 1, 'state', 'running', 'at', ?)),
    attempts = attempts + 1, state = 'running', claim_token = ?, lease_expires_at = ?, failure_reason = NULL, updated_at = ?
    WHERE id = ? AND (state = 'pending' OR (state = 'running' AND lease_expires_at <= ?))`)
      .bind(now, now, token, expires, now, id, now),
    refreshJob(db, item.job_id, now),
  ]);
  if (result.meta.changes !== 1) return null;
  const claimed = await findItem(db, id);
  return claimed?.claim_token === token ? itemFromRow(claimed) : null;
}

export async function finishTranslationJobItem(
  db: D1Database,
  id: string,
  claimToken: string,
  outcome: {
    state: Extract<TranslationItemState, 'succeeded' | 'failed' | 'skipped'>;
    failureReason?: string;
  },
): Promise<boolean> {
  boundedId(claimToken);
  if (!['succeeded', 'failed', 'skipped'].includes(outcome.state))
    throw new ContentValidationError('invalid item outcome');
  const failure =
    outcome.state === 'failed' ? failureCode(outcome.failureReason) : null;
  const item = await findItem(db, id);
  if (!item) return false;
  const now = timestamp();
  const [result] = await batch(db, [
    db
      .prepare(`UPDATE ${schema.translationJobItems} SET state = ?, failure_reason = ?, claim_token = NULL, lease_expires_at = NULL, updated_at = ?,
    attempt_history_json = json_insert(attempt_history_json, '$[#]', json_object('attempt', attempts, 'state', ?, 'at', ?, 'failureReason', ?))
    WHERE id = ? AND state = 'running' AND claim_token = ?`)
      .bind(
        outcome.state,
        failure,
        now,
        outcome.state,
        now,
        failure,
        id,
        claimToken,
      ),
    refreshJob(db, item.job_id, now),
  ]);
  return result.meta.changes === 1;
}

export async function retryTranslationJobItem(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const item = await findItem(db, id);
  if (!item) return false;
  const now = timestamp();
  const [result] = await batch(db, [
    db
      .prepare(
        `UPDATE ${schema.translationJobItems} SET state = 'pending', claim_token = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND state = 'failed'`,
      )
      .bind(now, id),
    refreshJob(db, item.job_id, now),
  ]);
  return result.meta.changes === 1;
}
