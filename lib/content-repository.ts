import { uniriseSchema } from '../db/schema';
import type { AdminIdentity } from './admin-auth';
import type { Locale } from './locales';
import { localizedPath } from './localized-route';
import { getLocalizedContent, getTranslation } from './translation-repository';

export type ContentStatus = 'draft' | 'published';

export type ManagedNews = {
  id: string;
  legacyId: string;
  title: string;
  lead: string;
  imageUrl: string;
  highlights: string[];
  videoUrl: string | null;
  status: ContentStatus;
  publishedAt: string | null;
  updatedAt?: string;
};

export type ManagedDownload = {
  id: string;
  legacyId: string;
  title: string;
  status: ContentStatus;
  publishedAt: string | null;
  updatedAt?: string;
};

export type KnowledgeSource = {
  id: string;
  title: string;
  href: string;
  content: string;
  tags: string[];
};

export type ManagedKnowledge = KnowledgeSource & {
  status: ContentStatus;
  publishedAt: string | null;
  updatedAt: string;
};

type LocalizationMetadata = {
  requestedLocale: Locale;
  locale: Locale;
  missing: boolean;
  outdated: boolean;
};

export type LocalizedNews = ManagedNews & LocalizationMetadata;
export type LocalizedDownload = ManagedDownload & LocalizationMetadata;
export type LocalizedKnowledgeSource = KnowledgeSource & LocalizationMetadata;

export type KnowledgeInput = {
  id?: string;
  title: string;
  href: string;
  body: string;
  tags: string[];
  status: ContentStatus;
};

export type NewsInput = {
  id?: string;
  legacyId: string;
  title: string;
  lead: string;
  imageUrl: string;
  highlights: string[];
  videoUrl?: string | null;
  status: ContentStatus;
};

export type DownloadInput = {
  id?: string;
  legacyId: string;
  title: string;
  status: ContentStatus;
};

type NewsRow = {
  id: string;
  legacy_id: string;
  title: string;
  lead: string;
  image_url: string;
  highlights_json: string;
  video_url: string | null;
  status: ContentStatus;
  published_at: string | null;
  updated_at?: string;
};

type DownloadRow = {
  id: string;
  legacy_id: string;
  title: string;
  status: ContentStatus;
  published_at: string | null;
  updated_at?: string;
};

type KnowledgeRow = {
  id: string;
  title: string;
  href: string;
  body: string;
  tags_json: string;
  status: ContentStatus;
  published_at: string | null;
  updated_at?: string;
};

export class ContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentValidationError';
  }
}

export class ContentConflictError extends Error {
  constructor() {
    super('content changed while it was being saved');
    this.name = 'ContentConflictError';
  }
}

function requiredText(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string') {
    throw new ContentValidationError(`${field} must be text`);
  }
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximum) {
    throw new ContentValidationError(
      `${field} must be 1-${maximum} characters`,
    );
  }
  return normalized;
}

function contentStatus(value: unknown): ContentStatus {
  if (value !== 'draft' && value !== 'published') {
    throw new ContentValidationError('status must be draft or published');
  }
  return value;
}

function safeUrl(value: unknown, field: string) {
  const normalized = requiredText(value, field, 2048);
  if (normalized.startsWith('/') && !normalized.startsWith('//')) {
    try {
      const parsed = new URL(normalized, 'https://unirise.invalid');
      if (parsed.origin === 'https://unirise.invalid') return normalized;
    } catch {
      // The shared validation error below is more useful than the URL parser error.
    }
  }
  try {
    if (new URL(normalized).protocol === 'https:') return normalized;
  } catch {
    // The shared validation error below covers malformed absolute URLs.
  }
  throw new ContentValidationError(`${field} must be a local or https URL`);
}

function optionalUrl(value: unknown, field: string) {
  if (value == null || value === '') return null;
  return safeUrl(value, field);
}

function textList(value: unknown, field: string, maximumItems: number) {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new ContentValidationError(
      `${field} must have at most ${maximumItems} items`,
    );
  }
  return value.map((item) => requiredText(item, field, 8000));
}

function parseStringList(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function newsFromRow(row: NewsRow): ManagedNews {
  return {
    id: row.id,
    legacyId: row.legacy_id,
    title: row.title,
    lead: row.lead,
    imageUrl: row.image_url,
    highlights: parseStringList(row.highlights_json),
    videoUrl: row.video_url,
    status: row.status,
    publishedAt: row.published_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

function downloadFromRow(row: DownloadRow): ManagedDownload {
  return {
    id: row.id,
    legacyId: row.legacy_id,
    title: row.title,
    status: row.status,
    publishedAt: row.published_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

function knowledgeFromRow(row: KnowledgeRow): KnowledgeSource {
  return {
    id: row.id,
    title: row.title,
    href: row.href,
    content: row.body,
    tags: parseStringList(row.tags_json),
  };
}

function managedKnowledgeFromRow(row: KnowledgeRow): ManagedKnowledge {
  return {
    ...knowledgeFromRow(row),
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at ?? '',
  };
}

function publishedAt(status: ContentStatus, timestamp: string) {
  return status === 'published' ? timestamp : null;
}

function auditStatement(
  db: D1Database,
  actor: AdminIdentity,
  action: string,
  targetType: string,
  targetId: string,
  detail: Record<string, unknown>,
  timestamp: string,
) {
  return db
    .prepare(
      `INSERT INTO ${uniriseSchema.adminAuditLog} (id, admin_user_id, action, target_type, target_id, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actor.id,
      action,
      targetType,
      targetId,
      JSON.stringify(detail),
      timestamp,
    );
}

function conditionalAuditStatement(
  db: D1Database,
  actor: AdminIdentity,
  action: string,
  targetType: string,
  targetId: string,
  detail: Record<string, unknown>,
  timestamp: string,
) {
  return db
    .prepare(
      `INSERT INTO ${uniriseSchema.adminAuditLog} (id, admin_user_id, action, target_type, target_id, detail_json, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE changes() > 0`,
    )
    .bind(
      crypto.randomUUID(),
      actor.id,
      action,
      targetType,
      targetId,
      JSON.stringify(detail),
      timestamp,
    );
}

function recordId(value: unknown) {
  if (value == null || value === '') return crypto.randomUUID();
  return requiredText(value, 'id', 160);
}

function legacyId(value: unknown) {
  const normalized = requiredText(value, 'legacyId', 160);
  if (!/^\d+$/.test(normalized)) {
    throw new ContentValidationError('legacyId must contain only digits');
  }
  return normalized;
}

function inputRecord<T extends object>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContentValidationError('content must be an object');
  }
  return value;
}

async function publicationForSave(
  db: D1Database,
  table: string,
  id: string,
  requestedStatus: ContentStatus,
) {
  const existing = await db
    .prepare(
      `SELECT id, status, published_at, updated_at FROM ${table} WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<{
      id: string;
      status: ContentStatus;
      published_at: string | null;
      updated_at: string | null;
    }>();
  if (!existing) {
    if (requestedStatus !== 'draft') {
      throw new ContentValidationError(
        'new content must be saved as draft before publication',
      );
    }
    return {
      exists: false as const,
      status: 'draft' as const,
      publishedAt: null,
      updatedAt: null,
    };
  }
  if (requestedStatus !== existing.status) {
    throw new ContentValidationError(
      'publication changes require the publication operation',
    );
  }
  return {
    exists: true as const,
    status: existing.status,
    publishedAt: existing.published_at,
    updatedAt: existing.updated_at,
  };
}

async function commitContentSave(
  db: D1Database,
  write: D1PreparedStatement,
  audit: D1PreparedStatement,
) {
  // D1 metadata counts trigger writes. SQLite changes() reports only the
  // guarded primary write and is unchanged by the intervening SELECT.
  const [, signal] = await db.batch<{ primary_changes: number }>([
    write,
    db.prepare('SELECT changes() AS primary_changes'),
    audit,
  ]);
  if (signal.results[0]?.primary_changes !== 1)
    throw new ContentConflictError();
}

export async function listPublishedNews(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT id, legacy_id, title, lead, image_url, highlights_json, video_url, status, published_at
       FROM ${uniriseSchema.managedNews}
       WHERE status = ?
       ORDER BY published_at DESC`,
    )
    .bind('published')
    .all<NewsRow>();
  return rows.results.map(newsFromRow);
}

async function localizeNews(
  db: D1Database,
  news: ManagedNews,
  locale: Locale,
): Promise<LocalizedNews | null> {
  const localized = await getLocalizedContent(db, 'news', news.id, locale);
  if (!localized?.payload || localized.payload.kind !== 'news') return null;
  return {
    ...news,
    title: localized.payload.text.title,
    lead: localized.payload.text.lead,
    highlights: localized.payload.text.highlights,
    requestedLocale: localized.requestedLocale,
    locale: localized.locale,
    missing: localized.missing,
    outdated: localized.outdated,
  };
}

export async function listPublishedNewsForLocale(
  db: D1Database,
  locale: Locale,
): Promise<LocalizedNews[]> {
  const localized = await Promise.all(
    (await listPublishedNews(db)).map((news) => localizeNews(db, news, locale)),
  );
  return localized.filter((news): news is LocalizedNews => news !== null);
}

export async function listAllNews(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT id, legacy_id, title, lead, image_url, highlights_json, video_url, status, published_at, updated_at
       FROM ${uniriseSchema.managedNews}
       ORDER BY updated_at DESC`,
    )
    .all<NewsRow>();
  return rows.results.map(newsFromRow);
}

export async function findPublishedNewsByLegacyId(
  db: D1Database,
  legacyId: string,
) {
  const row = await db
    .prepare(
      `SELECT id, legacy_id, title, lead, image_url, highlights_json, video_url, status, published_at
       FROM ${uniriseSchema.managedNews}
       WHERE legacy_id = ? AND status = ?
       LIMIT 1`,
    )
    .bind(legacyId, 'published')
    .first<NewsRow>();
  return row ? newsFromRow(row) : null;
}

export async function findPublishedNewsByLegacyIdForLocale(
  db: D1Database,
  legacyId: string,
  locale: Locale,
): Promise<LocalizedNews | null> {
  const news = await findPublishedNewsByLegacyId(db, legacyId);
  return news ? localizeNews(db, news, locale) : null;
}

export async function listPublishedDownloads(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT id, legacy_id, title, status, published_at
       FROM ${uniriseSchema.managedDownloads}
       WHERE status = ?
       ORDER BY published_at DESC`,
    )
    .bind('published')
    .all<DownloadRow>();
  return rows.results.map(downloadFromRow);
}

async function localizeDownload(
  db: D1Database,
  download: ManagedDownload,
  locale: Locale,
): Promise<LocalizedDownload | null> {
  const localized = await getLocalizedContent(
    db,
    'download',
    download.id,
    locale,
  );
  if (!localized?.payload || localized.payload.kind !== 'download') return null;
  return {
    ...download,
    title: localized.payload.text.title,
    requestedLocale: localized.requestedLocale,
    locale: localized.locale,
    missing: localized.missing,
    outdated: localized.outdated,
  };
}

export async function listPublishedDownloadsForLocale(
  db: D1Database,
  locale: Locale,
): Promise<LocalizedDownload[]> {
  const localized = await Promise.all(
    (await listPublishedDownloads(db)).map((download) =>
      localizeDownload(db, download, locale),
    ),
  );
  return localized.filter(
    (download): download is LocalizedDownload => download !== null,
  );
}

export async function listAllDownloads(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT id, legacy_id, title, status, published_at, updated_at
       FROM ${uniriseSchema.managedDownloads}
       ORDER BY updated_at DESC`,
    )
    .all<DownloadRow>();
  return rows.results.map(downloadFromRow);
}

export async function listAllKnowledge(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT id, title, href, body, tags_json, status, published_at, updated_at
       FROM ${uniriseSchema.chatKnowledge}
       ORDER BY updated_at DESC`,
    )
    .all<KnowledgeRow>();
  return rows.results.map(managedKnowledgeFromRow);
}

function queryTerms(value: string) {
  const lower = value.toLowerCase();
  const latinAndNumbers = lower.match(/[a-z0-9]+/g) ?? [];
  const chinese = (lower.match(/[\u4e00-\u9fff]/g) ?? []).join('');
  const chinesePairs = Array.from(
    { length: Math.max(0, chinese.length - 1) },
    (_, index) => chinese.slice(index, index + 2),
  );
  const commonPairs = new Set([
    '我們',
    '你們',
    '公司',
    '網站',
    '提供',
    '可以',
    '請問',
    '是否',
    '哪些',
    '什麼',
    '怎麼',
    '如何',
    '資料',
    '資訊',
    '詳細',
    '想要',
    '需要',
    '知道',
    '介紹',
    '建議',
    '問題',
    '服務',
  ]);
  return [
    ...new Set([
      ...latinAndNumbers.filter((term) => term.length > 1),
      ...chinesePairs.filter((term) => !commonPairs.has(term)),
    ]),
  ];
}

function scoreKnowledge(source: KnowledgeSource, terms: string[]) {
  const searchable =
    `${source.title} ${source.content} ${source.tags.join(' ')}`.toLowerCase();
  return terms.reduce(
    (total, term) =>
      total + (searchable.includes(term) ? (term.length > 2 ? 3 : 1) : 0),
    0,
  );
}

function localizedKnowledgeHref(locale: Locale, href: string) {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const url = new URL(href, 'https://unirise.invalid');
  return localizedPath(locale, url.pathname, url.search, url.hash);
}

async function localizeKnowledge(
  db: D1Database,
  source: KnowledgeSource,
  locale: Locale,
  fallback: boolean,
): Promise<LocalizedKnowledgeSource | null> {
  const localized = await getLocalizedContent(db, 'knowledge', source.id, locale, {
    fallback,
  });
  let payload = localized?.payload;
  let resolvedLocale = localized?.locale;
  let missing = localized?.missing;
  let outdated = localized?.outdated;

  // The generic resolver safely falls back when an immutable literal differs
  // from the canonical source. Knowledge can retain its public, outdated prose
  // because the link is always replaced with the current canonical destination.
  if (
    locale === 'en' &&
    !fallback &&
    localized?.missing &&
    localized.source
  ) {
    const translation = await getTranslation(db, 'knowledge', source.id);
    if (
      translation?.status !== 'draft' &&
      translation?.payload.kind === 'knowledge' &&
      (translation.outdated ||
        translation.sourceVersion !== localized.source.sourceVersion)
    ) {
      payload = translation.payload;
      resolvedLocale = 'en';
      missing = false;
      outdated = true;
    }
  }
  if (
    !localized ||
    !payload ||
    payload.kind !== 'knowledge' ||
    !resolvedLocale ||
    missing === undefined ||
    outdated === undefined
  )
    return null;
  return {
    id: source.id,
    title: payload.text.title,
    href: localizedKnowledgeHref(locale, source.href),
    content: payload.text.body,
    tags: payload.text.tags,
    requestedLocale: localized.requestedLocale,
    locale: resolvedLocale,
    missing,
    outdated,
  };
}

export async function retrievePublishedKnowledge(
  db: D1Database,
  query: string,
  limit = 4,
): Promise<KnowledgeSource[]> {
  if (!Number.isInteger(limit) || limit < 1) return [];
  const rows = await db
    .prepare(
      `SELECT id, title, href, body, tags_json, status, published_at
       FROM ${uniriseSchema.chatKnowledge}
       WHERE status = ?
       ORDER BY published_at DESC`,
    )
    .bind('published')
    .all<KnowledgeRow>();
  const terms = queryTerms(query);
  return rows.results
    .map((row) => {
      const source = knowledgeFromRow(row);
      return { source, score: scoreKnowledge(source, terms) };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ source }) => source);
}

export async function retrievePublishedKnowledgeForLocale(
  db: D1Database,
  query: string,
  locale: Locale,
  limit = 4,
): Promise<LocalizedKnowledgeSource[]> {
  if (!Number.isInteger(limit) || limit < 1) return [];
  const rows = await db
    .prepare(
      `SELECT id, title, href, body, tags_json, status, published_at
       FROM ${uniriseSchema.chatKnowledge}
       WHERE status = ?
       ORDER BY published_at DESC`,
    )
    .bind('published')
    .all<KnowledgeRow>();
  const fallback = locale === 'zh-TW';
  const localized = await Promise.all(
    rows.results.map((row) =>
      localizeKnowledge(db, knowledgeFromRow(row), locale, fallback),
    ),
  );
  const terms = queryTerms(query);
  return localized
    .filter(
      (source): source is LocalizedKnowledgeSource => source !== null,
    )
    .map((source) => ({ source, score: scoreKnowledge(source, terms) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ source }) => source);
}

export async function saveKnowledge(
  db: D1Database,
  input: KnowledgeInput,
  actor: AdminIdentity,
) {
  const content = inputRecord(input);
  const id = recordId(content.id);
  const title = requiredText(content.title, 'title', 160);
  const href = safeUrl(content.href, 'href');
  const body = requiredText(content.body, 'body', 8000);
  const tags = textList(content.tags, 'tags', 12);
  const requestedStatus = contentStatus(content.status);
  const publication = await publicationForSave(
    db,
    uniriseSchema.chatKnowledge,
    id,
    requestedStatus,
  );
  const timestamp = new Date().toISOString();
  const write = publication.exists
    ? db
        .prepare(
          `UPDATE ${uniriseSchema.chatKnowledge}
           SET title = ?, href = ?, body = ?, tags_json = ?, updated_at = ?
           WHERE id = ? AND status = ? AND published_at IS ? AND updated_at IS ?`,
        )
        .bind(
          title,
          href,
          body,
          JSON.stringify(tags),
          timestamp,
          id,
          publication.status,
          publication.publishedAt,
          publication.updatedAt,
        )
    : db
        .prepare(
          `INSERT INTO ${uniriseSchema.chatKnowledge} (id, title, href, body, tags_json, status, published_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          id,
          title,
          href,
          body,
          JSON.stringify(tags),
          publication.status,
          publication.publishedAt,
          timestamp,
        );
  await commitContentSave(
    db,
    write,
    conditionalAuditStatement(
      db,
      actor,
      'knowledge.saved',
      'knowledge',
      id,
      { status: publication.status, title, href, tags },
      timestamp,
    ),
  );
  return { id, title, href, content: body, tags } satisfies KnowledgeSource;
}

export async function saveNews(
  db: D1Database,
  input: NewsInput,
  actor: AdminIdentity,
) {
  const content = inputRecord(input);
  const id = recordId(content.id);
  const normalizedLegacyId = legacyId(content.legacyId);
  const title = requiredText(content.title, 'title', 160);
  const lead = requiredText(content.lead, 'body', 8000);
  const imageUrl = safeUrl(content.imageUrl, 'imageUrl');
  const highlights = textList(content.highlights, 'highlights', 12);
  const videoUrl = optionalUrl(content.videoUrl, 'videoUrl');
  const requestedStatus = contentStatus(content.status);
  const publication = await publicationForSave(
    db,
    uniriseSchema.managedNews,
    id,
    requestedStatus,
  );
  const timestamp = new Date().toISOString();
  const write = publication.exists
    ? db
        .prepare(
          `UPDATE ${uniriseSchema.managedNews}
           SET legacy_id = ?, title = ?, lead = ?, image_url = ?, highlights_json = ?, video_url = ?, updated_at = ?
           WHERE id = ? AND status = ? AND published_at IS ? AND updated_at IS ?`,
        )
        .bind(
          normalizedLegacyId,
          title,
          lead,
          imageUrl,
          JSON.stringify(highlights),
          videoUrl,
          timestamp,
          id,
          publication.status,
          publication.publishedAt,
          publication.updatedAt,
        )
    : db
        .prepare(
          `INSERT INTO ${uniriseSchema.managedNews} (id, legacy_id, title, lead, image_url, highlights_json, video_url, status, published_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          id,
          normalizedLegacyId,
          title,
          lead,
          imageUrl,
          JSON.stringify(highlights),
          videoUrl,
          publication.status,
          publication.publishedAt,
          timestamp,
        );
  await commitContentSave(
    db,
    write,
    conditionalAuditStatement(
      db,
      actor,
      'news.saved',
      'news',
      id,
      { status: publication.status, legacyId: normalizedLegacyId, title },
      timestamp,
    ),
  );
  return {
    id,
    legacyId: normalizedLegacyId,
    title,
    lead,
    imageUrl,
    highlights,
    videoUrl,
    status: publication.status,
    publishedAt: publication.publishedAt,
  } satisfies ManagedNews;
}

export async function saveDownload(
  db: D1Database,
  input: DownloadInput,
  actor: AdminIdentity,
) {
  const content = inputRecord(input);
  const id = recordId(content.id);
  const normalizedLegacyId = legacyId(content.legacyId);
  const title = requiredText(content.title, 'title', 160);
  const requestedStatus = contentStatus(content.status);
  const publication = await publicationForSave(
    db,
    uniriseSchema.managedDownloads,
    id,
    requestedStatus,
  );
  const timestamp = new Date().toISOString();
  const write = publication.exists
    ? db
        .prepare(
          `UPDATE ${uniriseSchema.managedDownloads}
           SET legacy_id = ?, title = ?, updated_at = ?
           WHERE id = ? AND status = ? AND published_at IS ? AND updated_at IS ?`,
        )
        .bind(
          normalizedLegacyId,
          title,
          timestamp,
          id,
          publication.status,
          publication.publishedAt,
          publication.updatedAt,
        )
    : db
        .prepare(
          `INSERT INTO ${uniriseSchema.managedDownloads} (id, legacy_id, title, status, published_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          id,
          normalizedLegacyId,
          title,
          publication.status,
          publication.publishedAt,
          timestamp,
        );
  await commitContentSave(
    db,
    write,
    conditionalAuditStatement(
      db,
      actor,
      'download.saved',
      'download',
      id,
      { status: publication.status, legacyId: normalizedLegacyId, title },
      timestamp,
    ),
  );
  return {
    id,
    legacyId: normalizedLegacyId,
    title,
    status: publication.status,
    publishedAt: publication.publishedAt,
  } satisfies ManagedDownload;
}

async function setPublication(
  db: D1Database,
  table: string,
  targetType: string,
  id: string,
  statusValue: ContentStatus,
  actor: AdminIdentity,
) {
  const status = contentStatus(statusValue);
  const normalizedId = requiredText(id, 'id', 160);
  const existing = await db
    .prepare(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`)
    .bind(normalizedId)
    .first<{ id: string }>();
  if (!existing)
    throw new ContentValidationError(`${targetType} was not found`);
  const timestamp = new Date().toISOString();
  const action = `${targetType}.${status === 'published' ? 'published' : 'unpublished'}`;
  await db.batch([
    db
      .prepare(
        `UPDATE ${table} SET status = ?, published_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(status, publishedAt(status, timestamp), timestamp, normalizedId),
    auditStatement(
      db,
      actor,
      action,
      targetType,
      normalizedId,
      { status },
      timestamp,
    ),
  ]);
}

export function setKnowledgePublication(
  db: D1Database,
  id: string,
  status: ContentStatus,
  actor: AdminIdentity,
) {
  return setPublication(
    db,
    uniriseSchema.chatKnowledge,
    'knowledge',
    id,
    status,
    actor,
  );
}

export function setNewsPublication(
  db: D1Database,
  id: string,
  status: ContentStatus,
  actor: AdminIdentity,
) {
  return setPublication(
    db,
    uniriseSchema.managedNews,
    'news',
    id,
    status,
    actor,
  );
}

export function setDownloadPublication(
  db: D1Database,
  id: string,
  status: ContentStatus,
  actor: AdminIdentity,
) {
  return setPublication(
    db,
    uniriseSchema.managedDownloads,
    'download',
    id,
    status,
    actor,
  );
}
