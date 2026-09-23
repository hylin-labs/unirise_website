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
  await seedLegacyContent(d1, { seedEnglishTranslations: false });
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

function literalTokens(value: string) {
  return value.match(/__UNIRISE_LITERAL_\d+__/g) ?? [];
}

function englishGroqJson() {
  return async (_url: string | URL | Request, init?: RequestInit) => {
    const request = requestJson(init) as {
      messages: Array<{ content: string }>;
    };
    const output = structuredClone(JSON.parse(request.messages[1].content)) as {
      source: {
        kind: string;
        text: { title: string; lead: string; highlights: string[] };
        literals: Record<string, unknown>;
      };
    };
    const title = literalTokens(output.source.text.title);
    const lead = literalTokens(output.source.text.lead);
    const highlights = output.source.text.highlights.map(literalTokens);
    output.source.text = {
      title: `Chicken and fish bone ${title[0]}-ray inspection machine ${title[1]}`,
      lead: `This ${lead[0]}-ray inspection system uses ${lead[1]}-ray imaging and ${lead[2]} recognition to improve food safety.`,
      highlights: [
        'Detects low-density fish bones and chicken bones in food products.',
        `The ${highlights[1][0]} ${highlights[1][1]} deep-learning algorithm improves fine-bone detection.`,
        `The ${highlights[2][0]} hygienic design supports fresh, chilled, frozen, and cooked foods.`,
      ],
    };
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(output.source) } }],
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
      fetcher: englishGroqJson(),
    });

    expect(result).toMatchObject({ state: 'succeeded' });
    expect(
      await repository.getTranslation(d1, 'news', source.resourceId),
    ).toMatchObject({
      origin: 'ai',
      status: 'needs_review',
    });
    const saved = await repository.getTranslation(
      d1,
      'news',
      source.resourceId,
    );
    if (saved?.payload.kind !== 'news') throw new Error('expected news');
    expect(saved.payload.text.title).toBe(
      'Chicken and fish bone X-ray inspection machine Xavis',
    );
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

  it('uses strict resource-specific JSON schema mode for Groq', async () => {
    const { source } = await seeded();
    const groq = await import('../lib/groq-translation');
    let request: Record<string, unknown> | undefined;
    await groq.translateWithGroq(source, {
      groqApiKey: 'server-only-key',
      fetcher: async (_url, init) => {
        request = requestJson(init);
        const source = JSON.parse(
          (request.messages as Array<{ content: string }>)[1].content,
        ) as { source: Record<string, unknown> };
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(source.source) } }],
          }),
        );
      },
    });

    expect(request?.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: {
        name: 'unirise_news_translation',
        strict: true,
        schema: {
          type: 'object',
          required: ['kind', 'text', 'literals'],
          additionalProperties: false,
        },
      },
    });
  });

  it('protects full URLs and signed measurements before generic technical tokens', async () => {
    const { source } = await seeded();
    const literalSource = structuredClone(source);
    if (literalSource.payload.kind !== 'news')
      throw new Error('expected news source');
    literalSource.payload.text.lead =
      '請維持 -10°C，詳見 https://example.com/inspect?mode=cold#limits。';
    const groq = await import('../lib/groq-translation');
    let protectedText = '';
    await groq.translateWithGroq(literalSource, {
      groqApiKey: 'server-only-key',
      fetcher: async (_url, init) => {
        const request = requestJson(init) as {
          messages: Array<{ content: string }>;
        };
        const sent = JSON.parse(request.messages[1].content) as {
          source: { text: { lead: string } };
        };
        protectedText = sent.source.text.lead;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(sent.source) } }],
          }),
        );
      },
    });

    expect(protectedText).not.toContain(
      'https://example.com/inspect?mode=cold#limits',
    );
    expect(protectedText).toContain('請維持 __UNIRISE_LITERAL_');
    expect(protectedText).not.toContain('-__UNIRISE_LITERAL_');
  });

  it('restores dollar signs in protected URLs literally with no placeholder residue', async () => {
    const { source } = await seeded();
    const literalSource = structuredClone(source);
    if (literalSource.payload.kind !== 'news')
      throw new Error('expected news source');
    literalSource.payload.text.lead =
      '詳見 https://example.com/inspect?q=$&x=1。';
    const groq = await import('../lib/groq-translation');
    const translated = await groq.translateWithGroq(literalSource, {
      groqApiKey: 'server-only-key',
      fetcher: async (_url, init) => {
        const request = requestJson(init) as {
          messages: Array<{ content: string }>;
        };
        const sent = JSON.parse(request.messages[1].content) as {
          source: Record<string, unknown>;
        };
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(sent.source) } }],
          }),
        );
      },
    });

    if (translated.kind !== 'news') throw new Error('expected news');
    expect(translated.text.lead).toBe(literalSource.payload.text.lead);
    expect(JSON.stringify(translated)).not.toContain('__UNIRISE_LITERAL_');
  });

  it('protects whole parenthesized phone and Celsius spans and rejects their removal', async () => {
    const { source } = await seeded();
    const literalSource = structuredClone(source);
    if (literalSource.payload.kind !== 'news')
      throw new Error('expected news source');
    literalSource.payload.text.lead = '電話：(06) 3319283，溫度 -10℃。';
    const groq = await import('../lib/groq-translation');
    let protectedText = '';
    await groq.translateWithGroq(literalSource, {
      groqApiKey: 'server-only-key',
      fetcher: async (_url, init) => {
        const request = requestJson(init) as {
          messages: Array<{ content: string }>;
        };
        const sent = JSON.parse(request.messages[1].content) as {
          source: { text: { lead: string } };
        };
        protectedText = sent.source.text.lead;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(sent.source) } }],
          }),
        );
      },
    });

    expect(protectedText).toMatch(
      /^電話：__UNIRISE_LITERAL_\d+__，溫度 __UNIRISE_LITERAL_\d+__。$/,
    );
    await expect(
      groq.translateWithGroq(literalSource, {
        groqApiKey: 'server-only-key',
        fetcher: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      ...literalSource.payload,
                      text: {
                        ...literalSource.payload.text,
                        lead: '電話：06) 3319283，溫度 10℃。',
                      },
                    }),
                  },
                },
              ],
            }),
          ),
      }),
    ).rejects.toMatchObject({ code: 'translation_output_invalid' });
  });

  it('stops URL protection at a full-width sentence boundary', async () => {
    const { source } = await seeded();
    const literalSource = structuredClone(source);
    if (literalSource.payload.kind !== 'news')
      throw new Error('expected news source');
    literalSource.payload.text.lead =
      '詳見 https://example.com/inspect?mode=cold#limits。請聯絡我們。';
    const groq = await import('../lib/groq-translation');
    let protectedText = '';
    const translated = await groq.translateWithGroq(literalSource, {
      groqApiKey: 'server-only-key',
      fetcher: async (_url, init) => {
        const request = requestJson(init) as {
          messages: Array<{ content: string }>;
        };
        const sent = JSON.parse(request.messages[1].content) as {
          source: { text: { lead: string } };
        };
        protectedText = sent.source.text.lead;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(sent.source) } }],
          }),
        );
      },
    });

    expect(protectedText).toMatch(
      /^詳見 __UNIRISE_LITERAL_\d+__。請聯絡我們。$/,
    );
    if (translated.kind !== 'news') throw new Error('expected news');
    expect(translated.text.lead).toBe(literalSource.payload.text.lead);
  });

  it('rejects missing or duplicated literal placeholders', async () => {
    const { source } = await seeded();
    const groq = await import('../lib/groq-translation');
    const malformed = async (mutate: (value: string) => string) =>
      expect(
        groq.translateWithGroq(source, {
          groqApiKey: 'server-only-key',
          fetcher: async (_url, init) => {
            const request = requestJson(init) as {
              messages: Array<{ content: string }>;
            };
            const sent = JSON.parse(request.messages[1].content) as {
              source: Record<string, unknown>;
            };
            return new Response(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: mutate(JSON.stringify(sent.source)),
                    },
                  },
                ],
              }),
            );
          },
        }),
      ).rejects.toMatchObject({ code: 'translation_output_invalid' });

    await malformed((value) => value.replace('__UNIRISE_LITERAL_0__', ''));
    await malformed((value) =>
      value.replace(
        '__UNIRISE_LITERAL_0__',
        '__UNIRISE_LITERAL_0____UNIRISE_LITERAL_0__',
      ),
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

  it('reclaims an expired interrupted item', async () => {
    const { d1, repository, source } = await seeded();
    const service = await import('../lib/translation-service');
    const job = await repository.createTranslationJob(
      d1,
      'recover-expired-claim',
      actor,
      [source],
    );
    const [item] = await repository.listTranslationJobItems(d1, job.id);
    const abandoned = await repository.claimTranslationJobItem(d1, item.id, {
      now: '2026-01-01T00:00:00.000Z',
      leaseSeconds: 10,
    });

    const result = await service.processNextTranslationJobItem({
      db: d1,
      jobId: job.id,
      actor,
      groqApiKey: 'server-only-key',
      fetcher: englishGroqJson(),
    });

    expect(result).toMatchObject({ state: 'succeeded', itemId: item.id });
    expect(
      (await repository.listTranslationJobItems(d1, job.id))[0],
    ).toMatchObject({
      state: 'succeeded',
      attempts: 2,
    });
    await expect(
      repository.finishTranslationJobItem(d1, item.id, abandoned!.claimToken!, {
        state: 'failed',
        failureReason: 'abandoned_worker',
      }),
    ).resolves.toBe(false);
  });

  it('does not reclaim an active claim while processing a later pending item', async () => {
    const { d1, repository, source } = await seeded();
    const service = await import('../lib/translation-service');
    const download = (await repository.enumerateSources(d1)).find(
      (candidate) => candidate.resourceType === 'download',
    )!;
    const job = await repository.createTranslationJob(
      d1,
      'preserve-active-claim',
      actor,
      [source, download],
    );
    const activeItem = (
      await repository.listTranslationJobItems(d1, job.id)
    ).find((item) => item.resourceId === download.resourceId)!;
    const active = await repository.claimTranslationJobItem(d1, activeItem.id);

    const result = await service.processNextTranslationJobItem({
      db: d1,
      jobId: job.id,
      actor,
      groqApiKey: 'server-only-key',
      fetcher: englishGroqJson(),
    });

    expect(result).toMatchObject({
      state: 'succeeded',
      resourceId: source.resourceId,
    });
    expect(
      (await repository.listTranslationJobItems(d1, job.id)).find(
        (item) => item.id === activeItem.id,
      ),
    ).toMatchObject({
      state: 'running',
      attempts: 1,
      claimToken: active!.claimToken,
    });
  });

  it('times out when the provider stalls while its response body is read', async () => {
    const { source } = await seeded();
    const groq = await import('../lib/groq-translation');
    await expect(
      groq.translateWithGroq(source, {
        groqApiKey: 'server-only-key',
        timeoutMs: 5,
        fetcher: async () => new Response(new ReadableStream()),
      }),
    ).rejects.toMatchObject({ code: 'translation_timeout' });
  });
});
