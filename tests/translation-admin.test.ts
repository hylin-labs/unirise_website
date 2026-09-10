import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sqliteD1 } from './helpers/sqlite-d1';
import { seedLegacyContent } from '../lib/seed-content';
import * as repository from '../lib/translation-repository';
import {
  createAdminSessionCookie,
  requestAdminCode,
  verifyAdminCode,
} from '../lib/admin-auth';
import { getDashboardSnapshot } from '../lib/analytics';
import type {
  TranslationListing,
  AdminTranslationJob,
  AdminJobItem,
} from '../lib/translation-admin';
import type { TranslationRecord } from '../lib/translation-types';

vi.mock('cloudflare:workers', () => ({ env: {} }));
const closers: Array<() => void> = [];
afterEach(() => closers.splice(0).forEach((close) => close()));
const actor = {
  id: 'hungyu@gmail.com',
  email: 'hungyu@gmail.com',
  role: 'admin' as const,
};
const request = (method = 'GET', body?: object, query = '', cookie = '') =>
  new Request(`https://unirise.test/api/admin/translations${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const echoGroq: typeof fetch = async (_url, init) => {
  if (typeof init?.body !== 'string') throw new Error('expected JSON body');
  const sent = JSON.parse(init.body);
  const { source } = JSON.parse(sent.messages[1].content);
  return Response.json({
    choices: [{ message: { content: JSON.stringify(source) } }],
  });
};
async function setup() {
  const { d1, sqlite } = sqliteD1();
  closers.push(() => sqlite.close());
  await seedLegacyContent(d1);
  const source = (await repository.getCanonicalSource(d1, 'news', '3944'))!;
  const { createTranslationsAdminHandler } =
    await import('../app/api/admin/translations/route');
  const handler = createTranslationsAdminHandler(d1, async () => actor, {
    groqApiKey: 'secret',
    fetcher: echoGroq,
  });
  return { d1, sqlite, source, handler, createTranslationsAdminHandler };
}
const ref = { resourceType: 'news', resourceId: '3944', sourceVersion: 1 };
async function body(response: Response) {
  return response.json() as Promise<
    TranslationListing & {
      job: AdminTranslationJob;
      items: AdminJobItem[];
      record: TranslationRecord;
    }
  >;
}

describe('translation administration', () => {
  it('lists a fully translated catalogue within a fixed database-query budget', async () => {
    const { d1, createTranslationsAdminHandler } = await setup();
    for (const source of await repository.enumerateSources(d1))
      await repository.saveTranslation(
        d1,
        { ...source, origin: 'ai', status: 'needs_review' },
        actor,
      );
    let reads = 0;
    const counted = {
      prepare(sql: string) {
        reads += 1;
        return d1.prepare(sql);
      },
      batch: d1.batch.bind(d1),
    } as D1Database;
    const handler = createTranslationsAdminHandler(counted, async () => actor);
    const response = await handler(request('GET', undefined, '?limit=20'));
    expect(response.status).toBe(200);
    expect(
      (await body(response)).resources.every((resource) => resource.public),
    ).toBe(true);
    expect(reads).toBeLessThanOrEqual(10);
  });
  it('rejects every unauthenticated method and disabled or editor sessions', async () => {
    const { d1, sqlite, createTranslationsAdminHandler } = await setup();
    const handler = createTranslationsAdminHandler(d1);
    for (const method of ['GET', 'POST', 'PATCH'])
      expect(
        (await handler(request(method, method === 'GET' ? undefined : {})))
          .status,
      ).toBe(401);
    let code = '';
    await requestAdminCode(
      d1,
      actor.email,
      'visitor',
      async (message) => {
        code = message.code;
      },
      'test-pepper',
    );
    const identity = (await verifyAdminCode(
      d1,
      actor.email,
      code,
      new Date(),
      'test-pepper',
    ))!;
    const cookie = createAdminSessionCookie(identity.sessionToken);
    sqlite
      .prepare('UPDATE admin_users SET role = ? WHERE id = ?')
      .run('editor', actor.id);
    for (const method of ['GET', 'POST', 'PATCH'])
      expect(
        (
          await handler(
            request(method, method === 'GET' ? undefined : {}, '', cookie),
          )
        ).status,
      ).toBe(403);
    sqlite
      .prepare('UPDATE admin_users SET enabled = 0 WHERE id = ?')
      .run(actor.id);
    for (const method of ['GET', 'POST', 'PATCH'])
      expect(
        (
          await handler(
            request(method, method === 'GET' ? undefined : {}, '', cookie),
          )
        ).status,
      ).toBe(401);
    expect(
      sqlite.prepare('SELECT COUNT(*) AS n FROM admin_audit_log').get()!.n,
    ).toBe(0);
  });

  it('filters and paginates resources, separates AI visibility from review, and returns global summary', async () => {
    const { handler, source, d1 } = await setup();
    await repository.saveTranslation(
      d1,
      { ...source, origin: 'ai', status: 'needs_review' },
      actor,
    );
    const response = await handler(
      request(
        'GET',
        undefined,
        '?resourceType=news&state=needs_review&limit=1&offset=0',
      ),
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    const result = await body(response);
    expect(result.total).toBe(1);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]).toMatchObject({
      source: ref,
      translation: { status: 'needs_review', origin: 'ai', reviewedAt: null },
      public: true,
      reviewed: false,
    });
    expect(result.summary).toMatchObject({ needsReview: 1, published: 0 });
    expect(
      (
        await body(
          await handler(
            request('GET', undefined, '?state=needs_review&offset=1'),
          ),
        )
      ).resources,
    ).toEqual([]);
  });

  it('starts idempotent batches, processes only one item, and resumes from durable job state', async () => {
    const { handler, d1, createTranslationsAdminHandler, sqlite } =
      await setup();
    const start = {
      action: 'start',
      requestKey: 'batch-one',
      sources: [
        ref,
        { resourceType: 'news', resourceId: '3670', sourceVersion: 1 },
      ],
    };
    const sources = (await repository.enumerateSources(d1))
      .filter((source) => source.resourceType === 'news')
      .slice(0, 2);
    start.sources = sources.map(
      ({ resourceType, resourceId, sourceVersion }) => ({
        resourceType,
        resourceId,
        sourceVersion,
      }),
    );
    const first = await body(await handler(request('POST', start)));
    const duplicate = await body(await handler(request('POST', start)));
    expect(duplicate.job.id).toBe(first.job.id);
    expect(first.items.map((item: { state: string }) => item.state)).toEqual([
      'pending',
      'pending',
    ]);
    const step = await body(
      await handler(request('POST', { action: 'next', jobId: first.job.id })),
    );
    expect(
      step.items.filter(
        (item: { state: string }) => item.state === 'succeeded',
      ),
    ).toHaveLength(1);
    expect(JSON.stringify(step)).not.toContain('claimToken');
    const resumed = createTranslationsAdminHandler(d1, async () => actor, {
      groqApiKey: 'secret',
      fetcher: echoGroq,
    });
    const recovered = await body(
      await resumed(request('GET', undefined, `?jobId=${first.job.id}`)),
    );
    expect(recovered.jobs[0].progress).toMatchObject({
      total: 2,
      succeeded: 1,
      pending: 1,
    });
    const finished = await body(
      await resumed(request('POST', { action: 'next', jobId: first.job.id })),
    );
    expect(finished.job.state).toBe('completed');
    const actions = sqlite
      .prepare('SELECT action FROM admin_audit_log')
      .all()
      .map((row) => row.action);
    expect(
      actions.filter((action) => action === 'translation.batch_started'),
    ).toHaveLength(1);
    expect(
      actions.filter((action) => action === 'translation.item_succeeded'),
    ).toHaveLength(2);
  });

  it('records safe failures and retries the same single item without losing history', async () => {
    const { handler, d1, createTranslationsAdminHandler, sqlite } =
      await setup();
    const first = await body(
      await handler(
        request('POST', {
          action: 'translate',
          requestKey: 'single-one',
          ...ref,
        }),
      ),
    );
    expect(first.items).toHaveLength(1);
    const failing = createTranslationsAdminHandler(d1, async () => actor, {
      groqApiKey: 'secret',
      fetcher: async () => {
        throw new Error('private provider detail');
      },
    });
    const failed = await body(
      await failing(request('POST', { action: 'next', jobId: first.job.id })),
    );
    expect(failed.items[0]).toMatchObject({
      state: 'failed',
      failureReason: 'translation_upstream_unavailable',
    });
    expect(JSON.stringify(failed)).not.toContain('private provider detail');
    expect(
      (
        await handler(
          request('PATCH', {
            action: 'retry',
            jobId: first.job.id,
            itemId: failed.items[0].id,
          }),
        )
      ).status,
    ).toBe(200);
    const retried = await body(
      await handler(request('POST', { action: 'next', jobId: first.job.id })),
    );
    expect(retried.items[0]).toMatchObject({ state: 'succeeded', attempts: 2 });
    expect(
      retried.items[0].history.some(
        (entry: { state: string }) => entry.state === 'failed',
      ),
    ).toBe(true);
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'translation.item_retried'",
        )
        .get()!.n,
    ).toBe(1);
  });

  it('edits English as human draft and reviews, unpublishes, and publishes with audit records', async () => {
    const { handler, d1, source, sqlite } = await setup();
    const payload = structuredClone(source.payload);
    if (payload.kind !== 'news') throw new Error('expected news');
    payload.text.title = 'Chicken bone X-ray inspection Xavis';
    const edit = await handler(
      request('PATCH', {
        action: 'edit',
        ...ref,
        expectedUpdatedAt: null,
        payload,
      }),
    );
    expect(edit.status).toBe(200);
    let record = (await body(edit)).record;
    expect(record).toMatchObject({
      origin: 'human',
      status: 'draft',
      reviewedAt: null,
    });
    for (const [action, status] of [
      ['review', 'published'],
      ['unpublish', 'draft'],
      ['publish', 'published'],
    ]) {
      const response = await handler(
        request('PATCH', {
          action,
          ...ref,
          expectedUpdatedAt: record.updatedAt,
        }),
      );
      expect(response.status).toBe(200);
      record = (await body(response)).record;
      expect(record.status).toBe(status);
    }
    expect(
      (await repository.getLocalizedContent(d1, 'news', '3944', 'en'))?.payload,
    ).toEqual(payload);
    const actions = sqlite
      .prepare('SELECT action FROM admin_audit_log')
      .all()
      .map((row) => row.action);
    expect(actions).toContain('translation.saved');
    expect(actions).toContain('translation.reviewed');
    expect(actions).toContain('translation.draft');
    expect(actions).toContain('translation.published');
  });

  it('rejects stale revision and source edits without an audit write or lost update', async () => {
    const { handler, source, d1, sqlite } = await setup();
    const first = await repository.saveTranslation(
      d1,
      { ...source, origin: 'ai', status: 'needs_review' },
      actor,
    );
    const change = {
      ...source,
      payload: structuredClone(source.payload),
      origin: 'human' as const,
      status: 'draft' as const,
    };
    if (change.payload.kind === 'news') change.payload.text.lead += ' Updated.';
    await repository.saveTranslation(d1, change, actor);
    const count = sqlite
      .prepare('SELECT COUNT(*) AS n FROM admin_audit_log')
      .get()!.n;
    const stale = await handler(
      request('PATCH', {
        action: 'edit',
        ...ref,
        expectedUpdatedAt: first!.updatedAt,
        payload: source.payload,
      }),
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: 'translation_conflict' });
    expect(
      sqlite.prepare('SELECT COUNT(*) AS n FROM admin_audit_log').get()!.n,
    ).toBe(count);
    const latest = await repository.getTranslation(d1, 'news', '3944');
    expect(
      (
        await handler(
          request('PATCH', {
            action: 'publish',
            ...ref,
            sourceVersion: 999,
            expectedUpdatedAt: latest!.updatedAt,
          }),
        )
      ).status,
    ).toBe(409);
  });

  it('rejects cross-origin, unknown fields, bad filters, invalid methods and immutable literal edits', async () => {
    const { handler, source } = await setup();
    const cross = request('POST', { action: 'start', requestKey: 'cross' });
    cross.headers.set('Origin', 'https://evil.test');
    expect((await handler(cross)).status).toBe(403);
    for (const query of [
      '?limit=501',
      '?offset=-1',
      '?state=invalid',
      '?resourceType=bad',
      '?locale=zh-TW',
      '?limit=1&limit=2',
    ])
      expect((await handler(request('GET', undefined, query))).status).toBe(
        400,
      );
    expect((await handler(request('DELETE'))).status).toBe(405);
    for (const body of [
      { action: 'start', requestKey: 'bad', force: true },
      { action: 'next', jobId: '../bad' },
      { action: 'translate', requestKey: 'bad', ...ref, sourceVersion: '1' },
    ])
      expect((await handler(request('POST', body))).status).toBe(400);
    const payload = structuredClone(source.payload);
    if (payload.kind === 'news')
      payload.literals.imageUrl = 'https://evil.test/image.png';
    expect(
      (
        await handler(
          request('PATCH', {
            action: 'edit',
            ...ref,
            expectedUpdatedAt: null,
            payload,
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('renders AI needs-review as public but unreviewed and exposes source/version metadata', async () => {
    const { source, d1 } = await setup();
    const translation = await repository.saveTranslation(
      d1,
      { ...source, origin: 'ai', status: 'needs_review' },
      actor,
    );
    const { TranslationResourceCard } =
      await import('../components/translation-manager');
    const html = renderToStaticMarkup(
      createElement(TranslationResourceCard, {
        resource: { source, translation, public: true, reviewed: false },
        busy: false,
        onAction: () => {},
      }),
    );
    expect(html).toContain('公開・待人工審核');
    expect(html).not.toContain('已發布・已審核');
    expect(html).toContain('來源版本');
    expect(html).toContain('AI');
    expect(html).toContain('審核');
  });

  it('adds current translation summary without changing date-range analytics or content response shapes', async () => {
    const { d1, source } = await setup();
    await repository.saveTranslation(
      d1,
      { ...source, origin: 'ai', status: 'needs_review' },
      actor,
    );
    const snapshot = await getDashboardSnapshot(d1, {
      from: '2026-01-01',
      to: '2026-01-02',
    });
    expect(snapshot).toMatchObject({
      translations: { needsReview: 1, published: 0, draft: 0, outdated: 0 },
      metrics: { pageViews: 0, leads: 0 },
    });
    if (source.payload.kind !== 'news') throw new Error('expected news');
    expect(
      snapshot.content.news.find((item) => item.id === '3944'),
    ).toMatchObject({ title: source.payload.text.title, status: 'published' });
    expect(snapshot.content.news[0]).not.toHaveProperty('translation');
  });
});
