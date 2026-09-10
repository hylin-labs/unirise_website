import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../../lib/admin-auth';
import type { GroqTranslationOptions } from '../../../../lib/groq-translation';
import {
  ContentConflictError,
  ContentValidationError,
} from '../../../../lib/content-repository';
import {
  createTranslationJob,
  listTranslationResources,
  getTranslation,
  getTranslationJob,
  listTranslationJobItems,
  listTranslationJobs,
  retryTranslationJobItem,
  saveTranslation,
  setTranslationPublication,
} from '../../../../lib/translation-repository';
import { processNextTranslationJobItem } from '../../../../lib/translation-service';
import {
  RESOURCE_TYPES,
  validateResourceReference,
  type SourceReference,
  type TranslationPayload,
} from '../../../../lib/translation-types';
import type {
  AdminJobItem,
  AdminTranslationJob,
  TranslationResource,
  TranslationSummary,
} from '../../../../lib/translation-admin';

function json(value: object, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
function invalid(): never {
  throw new ContentValidationError('invalid request');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function keys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) {
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    invalid();
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w.-]{1,160}$/.test(value)) invalid();
  return value;
}
function reference(value: Record<string, unknown>): SourceReference {
  const ref = {
    resourceType: value.resourceType,
    resourceId: value.resourceId,
    sourceVersion: value.sourceVersion,
  } as SourceReference;
  validateResourceReference(ref);
  return ref;
}
function revision(value: unknown) {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !Number.isFinite(Date.parse(value))
  )
    invalid();
  return value;
}
function page(value: string | null, fallback: number, max: number) {
  if (value === null) return fallback;
  if (!/^\d{1,7}$/.test(value) || Number(value) > max) invalid();
  return Number(value);
}
async function jobDetails(db: D1Database, jobId: string) {
  const job = await getTranslationJob(db, jobId);
  if (!job) throw new ContentConflictError();
  const raw = await listTranslationJobItems(db, jobId);
  const progress = {
    total: raw.length,
    pending: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };
  const items: AdminJobItem[] = raw.map(
    ({ claimToken: _token, sourcePayload: _payload, ...item }) => {
      progress[item.state] += 1;
      return item;
    },
  );
  return { job: { ...job, progress } satisfies AdminTranslationJob, items };
}

export function createTranslationsAdminHandler(
  db: D1Database,
  authenticate: typeof requireAdmin = requireAdmin,
  options: GroqTranslationOptions = {},
) {
  return async (request: Request) => {
    try {
      const actor = await authenticate(request, db);
      if (!actor) return json({ error: 'unauthorized' }, 401);
      if (actor.role !== 'admin') return json({ error: 'forbidden' }, 403);
      const origin = request.headers.get('origin');
      if (
        (origin && origin !== new URL(request.url).origin) ||
        request.headers.get('sec-fetch-site') === 'cross-site'
      )
        return json({ error: 'origin_not_allowed' }, 403);
      if (!['GET', 'POST', 'PATCH'].includes(request.method))
        return json({ error: 'method_not_allowed' }, 405);
      if (request.method === 'GET') {
        const query = new URL(request.url).searchParams;
        const allowed = [
          'resourceType',
          'state',
          'origin',
          'outdated',
          'q',
          'limit',
          'offset',
          'jobId',
          'jobOffset',
        ];
        for (const key of query.keys())
          if (!allowed.includes(key) || query.getAll(key).length !== 1)
            invalid();
        const type = query.get('resourceType');
        const state = query.get('state');
        const sourceOrigin = query.get('origin');
        const outdated = query.get('outdated');
        const q = query.get('q') ?? '';
        if (type && !(RESOURCE_TYPES as readonly string[]).includes(type))
          invalid();
        if (
          state &&
          !['missing', 'draft', 'needs_review', 'published'].includes(state)
        )
          invalid();
        if (sourceOrigin && !['ai', 'human'].includes(sourceOrigin)) invalid();
        if (outdated && !['true', 'false'].includes(outdated)) invalid();
        if (q.length > 160) invalid();
        const limit = page(query.get('limit'), 20, 100);
        if (limit < 1) invalid();
        const offset = page(query.get('offset'), 0, 1_000_000);
        const resources: TranslationResource[] = [];
        const summary: TranslationSummary = {
          total: 0,
          missing: 0,
          needsReview: 0,
          published: 0,
          draft: 0,
          outdated: 0,
        };
        for (const resource of await listTranslationResources(db)) {
          const { source, translation } = resource;
          const stale =
            !!translation &&
            (translation.outdated ||
              translation.sourceVersion !== source.sourceVersion);
          summary.total += 1;
          if (!translation) summary.missing += 1;
          else if (translation.status === 'needs_review')
            summary.needsReview += 1;
          else summary[translation.status] += 1;
          if (stale) summary.outdated += 1;
          if (type && source.resourceType !== type) continue;
          if (state && (translation?.status ?? 'missing') !== state) continue;
          if (sourceOrigin && translation?.origin !== sourceOrigin) continue;
          if (outdated && stale !== (outdated === 'true')) continue;
          if (
            q &&
            !`${source.resourceId} ${JSON.stringify(source.payload.text)}`
              .toLowerCase()
              .includes(q.toLowerCase())
          )
            continue;
          resources.push(resource);
        }
        const selectedJob = query.get('jobId');
        const jobs = selectedJob
          ? [(await jobDetails(db, id(selectedJob))).job]
          : await Promise.all(
              (
                await listTranslationJobs(
                  db,
                  20,
                  page(query.get('jobOffset'), 0, 1_000_000),
                )
              ).map(async (job) => (await jobDetails(db, job.id)).job),
            );
        const items = selectedJob
          ? (await jobDetails(db, selectedJob)).items
          : [];
        return json({
          resources: resources.slice(offset, offset + limit),
          total: resources.length,
          limit,
          offset,
          summary,
          jobs,
          items,
        });
      }
      if (
        !request.headers
          .get('content-type')
          ?.toLowerCase()
          .startsWith('application/json')
      )
        invalid();
      if (Number(request.headers.get('content-length') ?? 0) > 220_000)
        invalid();
      const body = await request.text();
      if (body.length > 220_000) invalid();
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        invalid();
      }
      const payload = object(parsed);
      if (request.method === 'POST') {
        if (payload.action === 'start' || payload.action === 'translate') {
          keys(
            payload,
            payload.action === 'start'
              ? ['action', 'requestKey']
              : [
                  'action',
                  'requestKey',
                  'resourceType',
                  'resourceId',
                  'sourceVersion',
                ],
            payload.action === 'start' ? ['sources'] : [],
          );
          let sources: SourceReference[] | undefined;
          if (payload.action === 'translate') sources = [reference(payload)];
          else if (payload.sources !== undefined) {
            if (
              !Array.isArray(payload.sources) ||
              payload.sources.length < 1 ||
              payload.sources.length > 500
            )
              invalid();
            sources = payload.sources.map((value) => {
              const row = object(value);
              keys(row, ['resourceType', 'resourceId', 'sourceVersion']);
              return reference(row);
            });
          }
          const job = await createTranslationJob(
            db,
            id(payload.requestKey),
            actor,
            sources,
          );
          return json(await jobDetails(db, job.id), 201);
        }
        keys(payload, ['action', 'jobId']);
        if (payload.action !== 'next') invalid();
        const jobId = id(payload.jobId);
        await jobDetails(db, jobId);
        const result = await processNextTranslationJobItem({
          ...options,
          db,
          jobId,
          actor,
        });
        return json({ ...(await jobDetails(db, jobId)), result });
      }
      if (payload.action === 'retry') {
        keys(payload, ['action', 'jobId', 'itemId']);
        const jobId = id(payload.jobId);
        const itemId = id(payload.itemId);
        if (
          !(await listTranslationJobItems(db, jobId)).some(
            (item) => item.id === itemId && item.state === 'failed',
          )
        )
          throw new ContentConflictError();
        if (!(await retryTranslationJobItem(db, itemId, actor)))
          throw new ContentConflictError();
        return json(await jobDetails(db, jobId));
      }
      const action = payload.action;
      if (!['edit', 'review', 'publish', 'unpublish'].includes(String(action)))
        invalid();
      keys(payload, [
        'action',
        'resourceType',
        'resourceId',
        'sourceVersion',
        'expectedUpdatedAt',
        ...(action === 'edit' ? ['payload'] : []),
      ]);
      const ref = reference(payload);
      const expectedUpdatedAt = revision(payload.expectedUpdatedAt);
      if (action === 'edit') {
        await saveTranslation(
          db,
          {
            ...ref,
            expectedUpdatedAt,
            payload: payload.payload as TranslationPayload,
            status: 'draft',
            origin: 'human',
          },
          actor,
        );
      } else {
        await setTranslationPublication(
          db,
          ref.resourceType,
          ref.resourceId,
          action === 'unpublish' ? 'draft' : 'published',
          actor,
          {
            expectedUpdatedAt,
            sourceVersion: ref.sourceVersion,
            review: action === 'review',
          },
        );
      }
      return json({
        record: await getTranslation(db, ref.resourceType, ref.resourceId),
      });
    } catch (error) {
      if (error instanceof ContentValidationError)
        return json({ error: 'invalid_translation' }, 400);
      if (error instanceof ContentConflictError)
        return json({ error: 'translation_conflict' }, 409);
      return json({ error: 'translation_unavailable' }, 503);
    }
  };
}
function handler(request: Request) {
  const bindings = env as unknown as { DB: D1Database; GROQ_API_KEY?: string };
  return createTranslationsAdminHandler(bindings.DB, requireAdmin, {
    groqApiKey: bindings.GROQ_API_KEY,
  })(request);
}
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
