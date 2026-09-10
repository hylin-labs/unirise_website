import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedLegacyContent } from '../lib/seed-content';

const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

const actor = {
  id: 'hungyu@gmail.com',
  email: 'hungyu@gmail.com',
  role: 'admin' as const,
};

function database() {
  const sqlite = new DatabaseSync(':memory:');
  databases.push(sqlite);
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(resolve('drizzle'))
    .filter((file) => file.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(resolve('drizzle', file), 'utf8'));
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
        const before = Number(
          sqlite.prepare('SELECT total_changes() AS n').get()!.n,
        );
        const prepared = sqlite.prepare(sql);
        const results = prepared.columns().length
          ? prepared.all(...values)
          : (prepared.run(...values), []);
        return {
          success: true,
          results,
          meta: {
            changes:
              Number(sqlite.prepare('SELECT total_changes() AS n').get()!.n) -
              before,
          },
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
  return { d1 };
}

async function seeded() {
  const repository = await import('../lib/translation-repository');
  const { d1 } = database();
  await seedLegacyContent(d1);
  const source = (await repository.getCanonicalSource(d1, 'news', '3944'))!;
  return { d1, repository, source };
}

function groqJson() {
  return async (_url: string | URL | Request, init?: RequestInit) => {
    const request = requestJson(init) as {
      messages: Array<{ content: string }>;
    };
    const source = JSON.parse(request.messages[1].content) as {
      source: Record<string, unknown>;
    };
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(source.source) } }],
      }),
      { status: 200 },
    );
  };
}

function requestJson(init?: RequestInit) {
  if (typeof init?.body !== 'string') throw new Error('expected JSON body');
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('translation service', () => {
  it('saves a valid structured English result for review and makes it public', async () => {
    const { d1, repository, source } = await seeded();
    const service = await import('../lib/translation-service');
    const job = await repository.createTranslationJob(
      d1,
      'translate-news',
      actor,
      [source],
    );
    const result = await service.processNextTranslationJobItem({
      db: d1,
      jobId: job.id,
      actor,
      groqApiKey: 'server-only-key',
      fetcher: groqJson(),
    });

    expect(result).toMatchObject({ state: 'succeeded' });
    expect(
      await repository.getTranslation(d1, 'news', source.resourceId),
    ).toMatchObject({
      payload: source.payload,
      origin: 'ai',
      status: 'needs_review',
    });
    expect(
      await repository.getLocalizedContent(d1, 'news', source.resourceId, 'en'),
    ).toMatchObject({
      locale: 'en',
      missing: false,
    });
  });

  it('fails malformed Groq output with a safe retryable code', async () => {
    const { d1, repository, source } = await seeded();
    const service = await import('../lib/translation-service');
    const job = await repository.createTranslationJob(
      d1,
      'malformed-output',
      actor,
      [source],
    );
    const result = await service.processNextTranslationJobItem({
      db: d1,
      jobId: job.id,
      actor,
      groqApiKey: 'server-only-key',
      fetcher: async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'not JSON' } }] }),
        ),
    });

    expect(result).toMatchObject({
      state: 'failed',
      failureReason: 'translation_output_invalid',
    });
    expect(
      (await repository.listTranslationJobItems(d1, job.id))[0],
    ).toMatchObject({
      state: 'failed',
      failureReason: 'translation_output_invalid',
    });
  });

  it('restores protected literal fields exactly after Groq returns placeholders', async () => {
    const { source } = await seeded();
    const groq = await import('../lib/groq-translation');
    let requestPayload: Record<string, unknown> | undefined;
    const translated = await groq.translateWithGroq(source, {
      groqApiKey: 'server-only-key',
      fetcher: async (_url, init) => {
        requestPayload = requestJson(init);
        const source = JSON.parse(
          (requestPayload.messages as Array<{ content: string }>)[1].content,
        ) as { source: Record<string, unknown> };
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(source.source) } }],
          }),
        );
      },
    });

    expect(translated.literals).toEqual(source.payload.literals);
    expect(JSON.stringify(requestPayload)).not.toContain(
      JSON.stringify(source.payload.literals).slice(1, -1),
    );
  });

  it('records timeout and upstream failures as safe retryable item failures', async () => {
    const { d1, repository, source } = await seeded();
    const service = await import('../lib/translation-service');
    const job = await repository.createTranslationJob(
      d1,
      'upstream-failure',
      actor,
      [source],
    );
    const result = await service.processNextTranslationJobItem({
      db: d1,
      jobId: job.id,
      actor,
      groqApiKey: 'server-only-key',
      fetcher: async () => {
        throw new Error('provider secret and raw failure');
      },
    });

    expect(result).toMatchObject({
      state: 'failed',
      failureReason: 'translation_upstream_unavailable',
    });
    expect(await repository.retryTranslationJobItem(d1, result.itemId!)).toBe(
      true,
    );
  });

  it('skips a claimed item when a human English translation now protects it', async () => {
    const { d1, repository, source } = await seeded();
    const service = await import('../lib/translation-service');
    const job = await repository.createTranslationJob(
      d1,
      'human-protected',
      actor,
      [source],
    );
    await repository.saveTranslation(
      d1,
      { ...source, payload: source.payload, origin: 'human', status: 'draft' },
      actor,
    );

    const result = await service.processNextTranslationJobItem({
      db: d1,
      jobId: job.id,
      actor,
      groqApiKey: 'server-only-key',
      fetcher: groqJson(),
    });

    expect(result).toMatchObject({
      state: 'skipped',
      reason: 'human_translation_protected',
    });
  });

  it('continues with a later queued item after a previous item fails', async () => {
    const { d1, repository, source } = await seeded();
    const service = await import('../lib/translation-service');
    const download = (await repository.enumerateSources(d1)).find(
      (candidate) => candidate.resourceType === 'download',
    )!;
    const job = await repository.createTranslationJob(
      d1,
      'continue-after-failure',
      actor,
      [source, download],
    );
    const failed = await service.processNextTranslationJobItem({
      db: d1,
      jobId: job.id,
      actor,
      groqApiKey: 'server-only-key',
      fetcher: async () => new Response('', { status: 502 }),
    });
    const succeeded = await service.processNextTranslationJobItem({
      db: d1,
      jobId: job.id,
      actor,
      groqApiKey: 'server-only-key',
      fetcher: groqJson(),
    });

    expect(failed).toMatchObject({ state: 'failed' });
    expect(succeeded).toMatchObject({
      state: 'succeeded',
      resourceId: source.resourceId,
    });
  });
});
