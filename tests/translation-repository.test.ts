import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedLegacyContent } from '../lib/seed-content';
import { englishSeedPayload } from '../lib/english-seed';
import { ensureInitialContent } from '../lib/runtime-initialization';
import { saveNews } from '../lib/content-repository';

const databases: DatabaseSync[] = [];
afterEach(() => {
  databases.splice(0).forEach((db) => db.close());
  vi.useRealTimers();
});
const actor = {
  id: 'hungyu@gmail.com',
  email: 'hungyu@gmail.com',
  role: 'admin' as const,
};

// Execute real migrations and SQL; only adapt SQLite's result shape to D1.
function database(includeBilingual = true) {
  const sqlite = new DatabaseSync(':memory:');
  databases.push(sqlite);
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(resolve('drizzle'))
    .filter(
      (file) =>
        file.endsWith('.sql') &&
        (includeBilingual || !file.startsWith('0003_')),
    )
    .sort()) {
    sqlite.exec(readFileSync(resolve('drizzle', file), 'utf8'));
  }
  let fail = false;
  let transaction: Promise<unknown> = Promise.resolve();
  const prepare = (sql: string) => {
    let values: SQLInputValue[] = [];
    const statement = {
      bind(...args: SQLInputValue[]) {
        values = args;
        return statement;
      },
      async first() {
        return sqlite.prepare(sql).get(...values) ?? null;
      },
      async all() {
        return { success: true, results: sqlite.prepare(sql).all(...values) };
      },
      async run() {
        if (fail) {
          fail = false;
          throw new Error('seed unavailable');
        }
        // Miniflare D1 reports total_changes deltas, including trigger writes.
        const before = Number(
          sqlite.prepare('SELECT total_changes() AS n').get()!.n,
        );
        const prepared = sqlite.prepare(sql);
        let results: Record<string, unknown>[] = [];
        if (prepared.columns().length) results = prepared.all(...values);
        else prepared.run(...values);
        const changes =
          Number(sqlite.prepare('SELECT total_changes() AS n').get()!.n) -
          before;
        return {
          success: true,
          results,
          meta: { changes },
        };
      },
    };
    return statement;
  };
  const d1 = {
    prepare,
    batch(statements: D1PreparedStatement[]) {
      const operation = transaction.then(async () => {
        sqlite.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements)
            results.push(await statement.run());
          sqlite.exec('COMMIT');
          return results;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      });
      transaction = operation.catch(() => undefined);
      return operation;
    },
  } as unknown as D1Database;
  return {
    sqlite,
    d1,
    failNext: () => {
      fail = true;
    },
  };
}

async function repository() {
  return import('../lib/translation-repository');
}

async function seeded() {
  const api = await repository();
  const db = database();
  await seedLegacyContent(db.d1, { seedEnglishTranslations: false });
  const source = (await api.getCanonicalSource(db.d1, 'news', '3944'))!;
  const payload = structuredClone(source.payload);
  if (payload.kind !== 'news') throw new Error('expected news');
  payload.text.title = 'Chicken and fish bone X-ray inspection Xavis';
  return { ...db, api, source, payload };
}

describe('bilingual persistence', () => {
  it('migrates existing analytics records to an explicit Chinese locale', () => {
    const { sqlite } = database(false);
    sqlite.exec(
      "INSERT INTO site_events(id,name,path) VALUES('e','page_view','/'); INSERT INTO chat_question_log(id,question,outcome) VALUES('q','test','answered'); INSERT INTO chat_leads(id,request_type,name,email,message,source_path) VALUES('l','quote','A','a@example.com','test','/')",
    );
    sqlite.exec(
      "INSERT INTO managed_news(id,legacy_id,title,lead,image_url,highlights_json,status) VALUES('old','9000','原文','原文','/old.jpg','[]','published')",
    );
    sqlite.exec(
      readFileSync(resolve('drizzle/0003_add_bilingual_content.sql'), 'utf8'),
    );
    expect(
      sqlite
        .prepare(
          "SELECT title, source_version FROM managed_news WHERE id = 'old'",
        )
        .get(),
    ).toEqual({ title: '原文', source_version: 1 });
    for (const table of ['site_events', 'chat_question_log', 'chat_leads']) {
      expect(sqlite.prepare(`SELECT locale FROM ${table}`).get()).toEqual({
        locale: 'zh-TW',
      });
      expect(() => sqlite.exec(`UPDATE ${table} SET locale = 'fr'`)).toThrow();
    }
  });

  it('seeds canonical public copy once and preserves administrator changes across isolates', async () => {
    const { api, d1, sqlite } = await seeded();
    const records = await api.enumerateSources(d1);
    expect(
      records
        .filter((r) => r.resourceType === 'public_content')
        .map((r) => r.resourceId),
    ).toEqual(['catalog', 'chrome', 'contact', 'home', 'inquiry']);
    const home = (await api.getCanonicalSource(d1, 'public_content', 'home'))!;
    expect(home.payload.kind).toBe('home');
    const edited = structuredClone(home.payload);
    if (edited.kind !== 'home') throw new Error('expected home');
    edited.text.heading = '管理員編輯';
    await api.updateCanonicalSource(d1, { ...home, payload: edited }, actor);
    await seedLegacyContent(d1, { seedEnglishTranslations: false });
    expect(
      (await api.getCanonicalSource(d1, 'public_content', 'home'))?.payload,
    ).toEqual(edited);
    expect(
      sqlite.prepare('SELECT COUNT(*) AS n FROM public_content').get(),
    ).toEqual({ n: 5 });
  });

  it('exposes needs_review English immediately while draft remains private with explicit fallback', async () => {
    const { api, d1, source, payload } = await seeded();
    await api.saveTranslation(
      d1,
      { ...source, payload, status: 'needs_review', origin: 'ai' },
      actor,
    );
    expect(
      await api.getLocalizedContent(d1, 'news', '3944', 'en'),
    ).toMatchObject({
      locale: 'en',
      missing: false,
      outdated: false,
      payload: englishSeedPayload(payload),
    });
    await api.setTranslationPublication(d1, 'news', '3944', 'draft', actor);
    expect(
      await api.getLocalizedContent(d1, 'news', '3944', 'en'),
    ).toMatchObject({
      locale: 'zh-TW',
      missing: true,
      payload: source.payload,
    });
    expect(
      (await api.getLocalizedContent(d1, 'news', '3944', 'en'))?.translation,
    ).toBeNull();
    expect(
      await api.getLocalizedContent(d1, 'news', '3944', 'en', {
        fallback: false,
      }),
    ).toMatchObject({ missing: true, payload: null });
    expect(
      await api.getLocalizedContent(d1, 'news', '3944', 'zh-TW'),
    ).toMatchObject({ missing: false, payload: source.payload });
  });

  it('never exposes translations of unpublished Chinese sources', async () => {
    const { api, d1, sqlite, source, payload } = await seeded();
    await api.saveTranslation(
      d1,
      { ...source, payload, status: 'needs_review', origin: 'ai' },
      actor,
    );
    sqlite.exec("UPDATE managed_news SET status = 'draft' WHERE id = '3944'");
    expect(await api.getLocalizedContent(d1, 'news', '3944', 'en')).toBeNull();
  });

  it('increments Chinese versions atomically, preserves human English, and rejects stale writes', async () => {
    const { api, d1, sqlite, source, payload } = await seeded();
    await api.saveTranslation(
      d1,
      { ...source, payload, status: 'published', origin: 'human' },
      actor,
    );
    const edited = structuredClone(source.payload);
    if (edited.kind !== 'news') throw new Error('expected news');
    edited.text.title = '更新中文';
    await api.updateCanonicalSource(d1, { ...source, payload: edited }, actor);
    await expect(
      api.updateCanonicalSource(d1, { ...source, payload: edited }, actor),
    ).rejects.toThrow(/changed|version/);
    expect(
      (await api.getCanonicalSource(d1, 'news', '3944'))?.sourceVersion,
    ).toBe(2);
    expect(await api.getTranslation(d1, 'news', '3944')).toMatchObject({
      payload,
      sourceVersion: 1,
      status: 'needs_review',
      origin: 'human',
      outdated: true,
    });
    expect(
      await api.getLocalizedContent(d1, 'news', '3944', 'en'),
    ).toMatchObject({ locale: 'en', outdated: true, missing: false });
    await expect(
      api.saveTranslation(
        d1,
        { ...source, payload, status: 'needs_review', origin: 'ai' },
        actor,
      ),
    ).rejects.toThrow();
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM admin_audit_log WHERE action='source.updated'",
        )
        .get(),
    ).toEqual({ n: 1 });
  });

  it('invalidates translations from the existing Chinese news edit operation', async () => {
    const { api, d1, source, payload } = await seeded();
    await api.saveTranslation(
      d1,
      { ...source, payload, status: 'published', origin: 'human' },
      actor,
    );
    if (source.payload.kind !== 'news') throw new Error('expected news');
    await saveNews(
      d1,
      {
        id: '3944',
        ...source.payload.literals,
        ...source.payload.text,
        title: '新版中文',
        status: 'published',
      },
      actor,
    );
    expect(
      (await api.getCanonicalSource(d1, 'news', '3944'))?.sourceVersion,
    ).toBe(2);
    expect(await api.getTranslation(d1, 'news', '3944')).toMatchObject({
      origin: 'human',
      outdated: true,
      status: 'needs_review',
      payload,
    });
  });

  it('blocks AI overwrites of human edits and records human review/publication', async () => {
    const { api, d1, source, payload } = await seeded();
    await api.saveTranslation(
      d1,
      { ...source, payload, status: 'draft', origin: 'human' },
      actor,
    );
    await expect(
      api.saveTranslation(
        d1,
        { ...source, payload, status: 'needs_review', origin: 'ai' },
        actor,
      ),
    ).rejects.toThrow(/human/);
    await api.setTranslationPublication(d1, 'news', '3944', 'published', actor);
    expect(await api.getTranslation(d1, 'news', '3944')).toMatchObject({
      status: 'published',
      reviewedBy: actor.id,
      reviewedAt: expect.any(String),
    });
  });

  it('validates bounded payloads, safe links, matching resources, and immutable literals', async () => {
    const { source, payload } = await seeded();
    const { validateTranslationPayload } =
      await import('../lib/translation-types');
    expect(validateTranslationPayload(payload, source)).toEqual(payload);
    const bad = [
      { ...payload, kind: 'unknown' },
      { ...payload, text: { ...payload.text, title: 'x'.repeat(161) } },
      { ...payload, text: { ...payload.text, highlights: 'not an array' } },
      {
        ...payload,
        literals: { ...payload.literals, imageUrl: '//evil.example/a' },
      },
      {
        ...payload,
        literals: { ...payload.literals, imageUrl: 'javascript:alert(1)' },
      },
      {
        ...payload,
        literals: {
          ...payload.literals,
          imageUrl: 'https://changed.example/a',
        },
      },
      { ...payload, text: { ...payload.text, unexpected: 'field' } },
    ];
    for (const value of bad)
      expect(() => validateTranslationPayload(value, source)).toThrow();
    expect(() =>
      validateTranslationPayload(payload, {
        ...source,
        resourceType: 'download',
      }),
    ).toThrow();
    expect(() =>
      validateTranslationPayload(payload, { ...source, sourceVersion: 0 }),
    ).toThrow();
  });

  it('validates every canonical public shape and preserves technical model tokens in translation', async () => {
    const { api, d1 } = await seeded();
    const { validateTranslationPayload } =
      await import('../lib/translation-types');
    for (const source of await api.enumerateSources(d1))
      expect(validateTranslationPayload(source.payload, source)).toEqual(
        source.payload,
      );
    const source = (await api.getCanonicalSource(
      d1,
      'public_content',
      'catalog',
    ))!;
    const payload = structuredClone(source.payload);
    if (payload.kind !== 'catalog') throw new Error('expected catalog');
    payload.text.specialProduct = 'Wrong model FSCAN-999';
    expect(() => validateTranslationPayload(payload, source)).toThrow(
      /literal|technical/,
    );
    payload.text.specialProduct =
      '3. 魚骨/雞骨檢測 FSCAN-4350G2 X光食品自動異物檢測機';
    expect(() => validateTranslationPayload(payload, source)).toThrow(
      /literal|technical/,
    );
  });

  it('persists a deterministic job snapshot and repeated creation does not expand it', async () => {
    const { api, d1, sqlite } = await seeded();
    const job = await api.createTranslationJob(d1, 'request-1', actor);
    const items = await api.listTranslationJobItems(d1, job.id);
    expect(items.length).toBeGreaterThan(5);
    expect(
      items.every(
        (item) => item.sourceVersion === 1 && item.state === 'pending',
      ),
    ).toBe(true);
    sqlite.exec("UPDATE managed_news SET title = '新中文' WHERE id = '3944'");
    expect(
      await api.createTranslationJob(d1, 'request-1', actor),
    ).toMatchObject({ id: job.id });
    expect(await api.listTranslationJobItems(d1, job.id)).toEqual(items);
  });

  it('excludes current English and human edits from automatic batch enumeration', async () => {
    const { api, d1, source, payload } = await seeded();
    await api.saveTranslation(
      d1,
      { ...source, payload, status: 'published', origin: 'human' },
      actor,
    );
    const job = await api.createTranslationJob(
      d1,
      'batch-excludes-human',
      actor,
    );
    expect(
      (await api.listTranslationJobItems(d1, job.id)).some(
        (item) => item.resourceId === '3944' && item.resourceType === 'news',
      ),
    ).toBe(false);
  });

  it('claims once, retains failure history, retries idempotently, and fences old attempts', async () => {
    const { api, d1, source, sqlite } = await seeded();
    const job = await api.createTranslationJob(d1, 'single-item', actor, [
      source,
    ]);
    const [item] = await api.listTranslationJobItems(d1, job.id);
    const claimed = (await api.claimTranslationJobItem(d1, item.id))!;
    expect(claimed.attempts).toBe(1);
    expect(await api.claimTranslationJobItem(d1, item.id)).toBeNull();
    expect(
      await api.finishTranslationJobItem(d1, item.id, claimed.claimToken!, {
        state: 'failed',
        failureReason: 'provider_unavailable',
      }),
    ).toBe(true);
    expect(await api.getTranslationJob(d1, job.id)).toMatchObject({
      state: 'failed',
    });
    expect(await api.retryTranslationJobItem(d1, item.id)).toBe(true);
    expect(await api.retryTranslationJobItem(d1, item.id)).toBe(false);
    const retry = (await api.claimTranslationJobItem(d1, item.id))!;
    expect(retry.attempts).toBe(2);
    expect(
      await api.finishTranslationJobItem(d1, item.id, claimed.claimToken!, {
        state: 'succeeded',
      }),
    ).toBe(false);
    expect(
      await api.finishTranslationJobItem(d1, item.id, retry.claimToken!, {
        state: 'succeeded',
      }),
    ).toBe(true);
    expect(await api.getTranslationJob(d1, job.id)).toMatchObject({
      state: 'completed',
    });
    const row = sqlite
      .prepare(
        'SELECT attempt_history_json FROM translation_job_items WHERE id = ?',
      )
      .get(item.id)!;
    expect(JSON.parse(row.attempt_history_json as string)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attempt: 1,
          state: 'failed',
          failureReason: 'provider_unavailable',
        }),
        expect.objectContaining({ attempt: 2, state: 'succeeded' }),
      ]),
    );
  });

  it('reclaims an expired lease and rejects completion by the abandoned worker', async () => {
    const { api, d1, source } = await seeded();
    const job = await api.createTranslationJob(d1, 'lease-recovery', actor, [
      source,
    ]);
    const [item] = await api.listTranslationJobItems(d1, job.id);
    const first = (await api.claimTranslationJobItem(d1, item.id, {
      now: '2026-01-01T00:00:00.000Z',
      leaseSeconds: 30,
    }))!;
    const second = (await api.claimTranslationJobItem(d1, item.id, {
      now: '2026-01-01T00:00:31.000Z',
      leaseSeconds: 30,
    }))!;
    expect(second.attempts).toBe(2);
    expect(
      await api.finishTranslationJobItem(d1, item.id, first.claimToken!, {
        state: 'failed',
        failureReason: 'late',
      }),
    ).toBe(false);
  });

  it('retries initialization after actual failure and shares concurrent work per D1 binding', async () => {
    await repository();
    const first = database();
    first.failNext();
    await expect(ensureInitialContent(first.d1)).rejects.toThrow(
      'seed unavailable',
    );
    const pending = ensureInitialContent(first.d1);
    expect(ensureInitialContent(first.d1)).toBe(pending);
    await pending;
    const second = database();
    await ensureInitialContent(second.d1);
    for (const db of [first, second])
      expect(
        db.sqlite.prepare('SELECT COUNT(*) AS n FROM public_content').get(),
      ).toEqual({ n: 5 });
  });

  it('falls back safely when a stored English payload is malformed or its literal asset changed', async () => {
    const { api, d1, sqlite, source, payload } = await seeded();
    await api.saveTranslation(
      d1,
      { ...source, payload, origin: 'ai', status: 'needs_review' },
      actor,
    );
    sqlite.exec(
      "UPDATE content_translations SET payload_json = '{}' WHERE resource_id = '3944'",
    );
    expect(
      await api.getLocalizedContent(d1, 'news', '3944', 'en'),
    ).toMatchObject({
      missing: true,
      payload: source.payload,
      translation: null,
    });
    sqlite
      .prepare(
        "UPDATE content_translations SET payload_json = ? WHERE resource_id = '3944'",
      )
      .run(JSON.stringify(payload));
    sqlite.exec(
      "UPDATE managed_news SET image_url = '/changed.jpg' WHERE id = '3944'",
    );
    expect(
      await api.getLocalizedContent(d1, 'news', '3944', 'en'),
    ).toMatchObject({
      missing: false,
      translation: expect.objectContaining({ origin: 'ai' }),
      payload: englishSeedPayload({
        ...payload,
        literals: { ...payload.literals, imageUrl: '/changed.jpg' },
      }),
    });
  });

  it('tracks download and knowledge edits and does not republish a hidden English draft', async () => {
    const { api, d1, sqlite } = await seeded();
    for (const [type, table] of [
      ['download', 'managed_downloads'],
      ['knowledge', 'chat_knowledge'],
    ] as const) {
      const source = (await api.enumerateSources(d1)).find(
        (item) => item.resourceType === type,
      )!;
      await api.saveTranslation(
        d1,
        { ...source, origin: 'human', status: 'draft' },
        actor,
      );
      sqlite
        .prepare(`UPDATE ${table} SET title = ? WHERE id = ?`)
        .run('更新中文', source.resourceId);
      expect(
        (await api.getCanonicalSource(d1, type, source.resourceId))
          ?.sourceVersion,
      ).toBe(2);
      expect(
        await api.getTranslation(d1, type, source.resourceId),
      ).toMatchObject({ status: 'draft', origin: 'human', outdated: true });
      expect(
        (await api.getLocalizedContent(d1, type, source.resourceId, 'en'))
          ?.missing,
      ).toBe(true);
    }
  });

  it('rolls back a translation write if its audit record cannot be persisted', async () => {
    const { api, d1, source, payload } = await seeded();
    await expect(
      api.saveTranslation(
        d1,
        { ...source, payload, origin: 'ai', status: 'needs_review' },
        { ...actor, id: 'missing-admin' },
      ),
    ).rejects.toThrow();
    expect(await api.getTranslation(d1, 'news', '3944')).toBeNull();
  });

  it('allows a new AI result after a source edit but rejects the old version and reviewed stale publication', async () => {
    const { api, d1, source, payload } = await seeded();
    await api.saveTranslation(
      d1,
      { ...source, payload, origin: 'ai', status: 'needs_review' },
      actor,
    );
    await api.updateCanonicalSource(d1, source, actor);
    await expect(
      api.saveTranslation(
        d1,
        { ...source, payload, origin: 'ai', status: 'needs_review' },
        actor,
      ),
    ).rejects.toThrow();
    await expect(
      api.setTranslationPublication(d1, 'news', '3944', 'published', actor),
    ).rejects.toThrow();
    await api.saveTranslation(
      d1,
      {
        ...source,
        sourceVersion: 2,
        payload,
        origin: 'ai',
        status: 'needs_review',
      },
      actor,
    );
    expect(await api.getTranslation(d1, 'news', '3944')).toMatchObject({
      sourceVersion: 2,
      outdated: false,
    });
  });

  it('rejects invalid job outcomes and stores safe failure codes only', async () => {
    const { api, d1, source } = await seeded();
    const job = await api.createTranslationJob(d1, 'safe-failure', actor, [
      source,
    ]);
    const [item] = await api.listTranslationJobItems(d1, job.id);
    const claim = (await api.claimTranslationJobItem(d1, item.id))!;
    await expect(
      api.finishTranslationJobItem(d1, item.id, claim.claimToken!, {
        state: 'failed',
        failureReason: 'API key: secret with user text',
      }),
    ).rejects.toThrow(/safe error code/);
    expect((await api.listTranslationJobItems(d1, job.id))[0].state).toBe(
      'running',
    );
  });

  it('rejects translation output from a worker whose claim was replaced', async () => {
    const { api, d1, source, payload } = await seeded();
    const job = await api.createTranslationJob(d1, 'fenced-write', actor, [
      source,
    ]);
    const [item] = await api.listTranslationJobItems(d1, job.id);
    const first = (await api.claimTranslationJobItem(d1, item.id, {
      now: '2026-01-01T00:00:00.000Z',
      leaseSeconds: 30,
    }))!;
    await api.claimTranslationJobItem(d1, item.id);
    await expect(
      api.saveTranslation(
        d1,
        {
          ...source,
          payload,
          status: 'needs_review',
          origin: 'ai',
          claim: { itemId: item.id, token: first.claimToken! },
        },
        actor,
      ),
    ).rejects.toThrow();
    expect(await api.getTranslation(d1, 'news', '3944')).toBeNull();
  });

  it('creates one job and grants one claim when requests race', async () => {
    const { api, d1, source, sqlite } = await seeded();
    const jobs = await Promise.all([
      api.createTranslationJob(d1, 'same-request', actor, [source]),
      api.createTranslationJob(d1, 'same-request', actor, [source]),
    ]);
    expect(jobs[0].id).toBe(jobs[1].id);
    expect(
      sqlite.prepare('SELECT COUNT(*) AS n FROM translation_jobs').get(),
    ).toEqual({ n: 1 });
    const items = await api.listTranslationJobItems(d1, jobs[0].id);
    expect(items).toHaveLength(1);
    const claims = await Promise.all([
      api.claimTranslationJobItem(d1, items[0].id),
      api.claimTranslationJobItem(d1, items[0].id),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(
      (await api.listTranslationJobItems(d1, jobs[0].id))[0].attempts,
    ).toBe(1);
  });

  it('accepts source updates with trigger-inclusive D1 accounting and rejects a stale replay', async () => {
    const { api, d1, source, payload, sqlite } = await seeded();
    await api.saveTranslation(
      d1,
      { ...source, payload, origin: 'human', status: 'published' },
      actor,
    );
    await expect(
      api.updateCanonicalSource(d1, source, actor),
    ).resolves.toMatchObject({ sourceVersion: 2 });
    expect(await api.getTranslation(d1, 'news', '3944')).toMatchObject({
      outdated: true,
    });
    await expect(api.updateCanonicalSource(d1, source, actor)).rejects.toThrow(
      /changed/,
    );
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'source.updated'",
        )
        .get(),
    ).toEqual({ n: 1 });
  });

  it('makes identical translation save replays preserve timestamps and one audit record', async () => {
    const { api, d1, source, payload, sqlite } = await seeded();
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-10T01:00:00.000Z');
    const input = {
      ...source,
      payload,
      origin: 'human' as const,
      status: 'published' as const,
    };
    await api.saveTranslation(d1, input, actor);
    const first = await api.getTranslation(d1, 'news', '3944');
    vi.setSystemTime('2026-09-10T01:01:00.000Z');
    await api.saveTranslation(d1, input, actor);
    expect(await api.getTranslation(d1, 'news', '3944')).toEqual(first);
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'translation.saved'",
        )
        .get(),
    ).toEqual({ n: 1 });
    const edited = structuredClone(payload);
    edited.text.title = 'Updated chicken and fish bone X-ray inspection Xavis';
    await api.saveTranslation(d1, { ...input, payload: edited }, actor);
    expect(await api.getTranslation(d1, 'news', '3944')).toMatchObject({
      payload: edited,
      updatedAt: '2026-09-10T01:01:00.000Z',
    });
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'translation.saved'",
        )
        .get(),
    ).toEqual({ n: 2 });
  });

  it('makes repeated publication preserve reviewer timestamps and one audit record', async () => {
    const { api, d1, source, payload, sqlite } = await seeded();
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-10T01:00:00.000Z');
    await api.saveTranslation(
      d1,
      { ...source, payload, origin: 'human', status: 'draft' },
      actor,
    );
    await api.setTranslationPublication(d1, 'news', '3944', 'published', actor);
    const first = await api.getTranslation(d1, 'news', '3944');
    vi.setSystemTime('2026-09-10T01:01:00.000Z');
    await api.setTranslationPublication(d1, 'news', '3944', 'published', actor);
    expect(await api.getTranslation(d1, 'news', '3944')).toEqual(first);
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'translation.published'",
        )
        .get(),
    ).toEqual({ n: 1 });
  });

  it('coalesces concurrent identical saves and publication without duplicate audit', async () => {
    const { api, d1, source, payload, sqlite } = await seeded();
    const input = {
      ...source,
      payload,
      origin: 'ai' as const,
      status: 'needs_review' as const,
    };
    await expect(
      Promise.all([
        api.saveTranslation(d1, input, actor),
        api.saveTranslation(d1, input, actor),
      ]),
    ).resolves.toHaveLength(2);
    await expect(
      Promise.all([
        api.setTranslationPublication(d1, 'news', '3944', 'published', actor),
        api.setTranslationPublication(d1, 'news', '3944', 'published', actor),
      ]),
    ).resolves.toHaveLength(2);
    expect(
      sqlite
        .prepare(
          'SELECT action, COUNT(*) AS n FROM admin_audit_log GROUP BY action ORDER BY action',
        )
        .all(),
    ).toEqual([
      { action: 'translation.published', n: 1 },
      { action: 'translation.saved', n: 1 },
    ]);
  });

  it('rejects an obsolete claim even when its output matches the saved English exactly', async () => {
    const { api, d1, source, payload, sqlite } = await seeded();
    const input = {
      ...source,
      payload,
      origin: 'ai' as const,
      status: 'needs_review' as const,
    };
    await api.saveTranslation(d1, input, actor);
    const job = await api.createTranslationJob(
      d1,
      'matching-output-stale-claim',
      actor,
      [source],
    );
    const [item] = await api.listTranslationJobItems(d1, job.id);
    const first = (await api.claimTranslationJobItem(d1, item.id, {
      now: '2026-01-01T00:00:00.000Z',
      leaseSeconds: 30,
    }))!;
    await api.claimTranslationJobItem(d1, item.id);
    await expect(
      api.saveTranslation(
        d1,
        { ...input, claim: { itemId: item.id, token: first.claimToken! } },
        actor,
      ),
    ).rejects.toThrow(/changed/);
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'translation.saved'",
        )
        .get(),
    ).toEqual({ n: 1 });
  });
});
