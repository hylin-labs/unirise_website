import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AdminLoginForm } from '../components/admin-login-form';
import { createAnalyticsHandler } from '../app/api/analytics/route';
import { createChatHandler } from '../app/api/chat/route';
import {
  getDashboardMetrics,
  dashboardBounds,
  hashVisitorIdentifier,
  recordChatOutcome,
  recordEvent,
  sanitizeQuestion,
} from '../lib/analytics';

vi.mock('cloudflare:workers', () => ({ env: {} }));

const TEST_ANALYTICS_PEPPER = 'analytics-test-pepper-at-least-32-characters';

type Row = Record<string, unknown>;

const d1Result = <T>(results: T[] = [], changes = 0) => ({
  success: true as const,
  results,
  meta: {
    duration: 0,
    size_after: 0,
    rows_read: results.length,
    rows_written: changes,
    last_row_id: 0,
    changed_db: changes > 0,
    changes,
  },
});

class AnalyticsStatement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly database: AnalyticsDatabase,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    return d1Result([], this.database.write(this.sql, this.values));
  }

  async all<T>() {
    return d1Result(this.database.read(this.sql, this.values) as T[]);
  }

  async first<T>() {
    return (
      (this.database.read(this.sql, this.values)[0] as T | undefined) ?? null
    );
  }
}

class AnalyticsDatabase {
  readonly events: Row[] = [];
  readonly questions: Row[] = [];
  readonly leads: Row[] = [];
  readonly rateLimits: Row[] = [];
  readonly publishedDownloadIds = new Set(['78']);

  readonly d1 = {
    prepare: (sql: string) =>
      new AnalyticsStatement(sql, this) as unknown as D1PreparedStatement,
    batch: async (statements: D1PreparedStatement[]) => {
      const results = [];
      for (const statement of statements) {
        results.push(await (statement as unknown as AnalyticsStatement).run());
      }
      return results;
    },
  } as unknown as D1Database;

  write(sql: string, values: unknown[]) {
    const query = compact(sql);
    if (query.startsWith('insert into site_events')) {
      this.events.push(rowFromInsert(sql, values));
      return 1;
    }
    if (query.startsWith('delete from chat_question_log')) {
      const cutoff = String(values[0]);
      const retained = this.questions.filter(
        (row) => String(row.created_at) >= cutoff,
      );
      const removed = this.questions.length - retained.length;
      this.questions.splice(0, this.questions.length, ...retained);
      return removed;
    }
    if (query.startsWith('insert into chat_question_log')) {
      this.questions.push(rowFromInsert(sql, values));
      return 1;
    }
    if (query.startsWith('delete from site_chat_rate_limits')) return 0;
    throw new Error(`Unsupported analytics write: ${sql}`);
  }

  read(sql: string, values: unknown[]) {
    const query = compact(sql);
    const inRange = (row: Row) =>
      String(row.occurred_at ?? row.created_at) >= String(values[0]) &&
      String(row.occurred_at ?? row.created_at) < String(values[1]);

    if (query.startsWith('insert into site_chat_rate_limits')) {
      const [bucket, visitorHash] = values.map(String);
      const existing = this.rateLimits.find(
        (row) => row.bucket === bucket && row.visitor_hash === visitorHash,
      );
      if (existing) {
        existing.request_count = Number(existing.request_count) + 1;
        return [{ request_count: existing.request_count }];
      }
      this.rateLimits.push({
        bucket,
        visitor_hash: visitorHash,
        request_count: 1,
      });
      return [{ request_count: 1 }];
    }

    if (
      query.includes('from managed_downloads') &&
      query.includes('legacy_id = ?')
    ) {
      return this.publishedDownloadIds.has(String(values[0])) &&
        values[1] === 'published'
        ? [{ id: `download-${String(values[0])}` }]
        : [];
    }

    if (
      query.includes('from site_events') &&
      query.includes('unique_visitors')
    ) {
      const rows = this.events.filter(inRange);
      const count = (name: string) =>
        rows.filter((row) => row.name === name).length;
      return [
        {
          unique_visitors: new Set(
            rows
              .filter((row) => row.name === 'page_view')
              .map((row) => row.visitor_hash)
              .filter(Boolean),
          ).size,
          page_views: count('page_view'),
          download_clicks: count('download_click'),
          chat_questions: count('chat_question'),
          chat_answered: count('chat_answered'),
          unanswered_questions: count('chat_unanswered'),
          leads: count('inquiry_submitted'),
        },
      ];
    }
    if (query.includes('from chat_question_log')) {
      return this.questions
        .filter(inRange)
        .filter((row) => row.outcome === 'unanswered')
        .sort((left, right) =>
          String(right.created_at).localeCompare(String(left.created_at)),
        )
        .slice(0, 100);
    }
    if (query.includes('from site_events') && query.includes('group by path')) {
      const name = String(values[2]);
      const totals = new Map<string, number>();
      for (const row of this.events
        .filter(inRange)
        .filter((row) => row.name === name)) {
        totals.set(String(row.path), (totals.get(String(row.path)) ?? 0) + 1);
      }
      return [...totals].map(([path, count]) => ({ path, count }));
    }
    if (query.includes('from chat_leads')) {
      return this.leads.filter(inRange).slice(0, 100);
    }
    return [];
  }
}

function compact(sql: string) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function rowFromInsert(sql: string, values: unknown[]) {
  const match = sql.match(/\(([^)]+)\)\s*values/i);
  if (!match) throw new Error(`Cannot parse insert: ${sql}`);
  return Object.fromEntries(
    match[1]
      .split(',')
      .map((column) => column.trim())
      .map((column, index) => [column, values[index]]),
  );
}

describe('analytics metrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('calculates conversion from leads divided by distinct visitors', async () => {
    const database = new AnalyticsDatabase();
    await recordEvent(database.d1, {
      visitorHash: 'a',
      name: 'page_view',
      path: '/',
    });
    await recordEvent(database.d1, {
      visitorHash: 'b',
      name: 'page_view',
      path: '/news',
    });
    await recordEvent(database.d1, {
      visitorHash: 'lead-edge-identifier',
      name: 'inquiry_submitted',
      path: '/',
    });

    await expect(
      getDashboardMetrics(database.d1, {
        from: '2026-09-01',
        to: '2026-09-03',
      }),
    ).resolves.toMatchObject({
      uniqueVisitors: 2,
      pageViews: 2,
      leads: 1,
      leadConversionRate: 0.5,
    });
  });

  it('uses accepted questions as the answer-rate denominator and returns zero for empty ratios', async () => {
    const database = new AnalyticsDatabase();
    await recordEvent(database.d1, {
      visitorHash: 'visitor-a',
      name: 'chat_question',
      path: '/catalog',
    });
    await recordEvent(database.d1, {
      visitorHash: 'visitor-a',
      name: 'chat_answered',
      path: '/catalog',
    });
    await recordEvent(database.d1, {
      visitorHash: 'visitor-b',
      name: 'chat_question',
      path: '/news',
    });
    await recordEvent(database.d1, {
      visitorHash: 'visitor-b',
      name: 'chat_unanswered',
      path: '/news',
    });

    await expect(
      getDashboardMetrics(database.d1, {
        from: '2026-09-01',
        to: '2026-09-03',
      }),
    ).resolves.toMatchObject({
      chatQuestions: 2,
      chatAnswerRate: 0.5,
      unansweredQuestions: 1,
      leadConversionRate: 0,
    });
  });

  it('sanitizes stored questions without running retention deletion on a public chat write', async () => {
    const database = new AnalyticsDatabase();
    database.questions.push({
      id: 'old',
      question: 'old question',
      outcome: 'unanswered',
      source_ids_json: '[]',
      created_at: '2026-05-01T00:00:00.000Z',
    });

    await recordChatOutcome(database.d1, {
      question: '請寄給 buyer@example.com，電話 0912-345-678。\u0000',
      outcome: 'answered',
      sourceIds: ['catalog-xavis-xray', 'catalog-xavis-xray', 'bad id!'],
    });

    expect(database.questions).toHaveLength(2);
    expect(database.questions[0]).toMatchObject({
      id: 'old',
      question: 'old question',
    });
    expect(database.questions[1]).toMatchObject({
      question: '請寄給 [電子信箱已隱藏]，電話 [電話已隱藏]。',
      outcome: 'answered',
      source_ids_json: '["catalog-xavis-xray"]',
    });
  });

  it('does not run retention deletion when a public chat question is refused', async () => {
    const database = new AnalyticsDatabase();
    database.questions.push({
      id: 'old',
      question: 'old question',
      outcome: 'unanswered',
      source_ids_json: '[]',
      created_at: '2026-05-01T00:00:00.000Z',
    });

    await recordChatOutcome(database.d1, {
      question: 'Please deliver to 123 Main Street',
      outcome: 'unanswered',
      sourceIds: [],
    });

    expect(database.questions.map((row) => row.id)).toEqual(['old']);
  });

  it('redacts contact details again when displaying a legacy unanswered question', async () => {
    const database = new AnalyticsDatabase();
    database.questions.push({
      id: 'gap-1',
      question: '請聯絡 legacy@example.com 或 06-3319283',
      outcome: 'unanswered',
      source_ids_json: '[]',
      created_at: '2026-09-02T10:00:00.000Z',
    });
    const handler = createAnalyticsHandler({
      db: database.d1,
      authenticate: async () => ({
        id: 'owner',
        email: 'hungyu@gmail.com',
        role: 'admin',
      }),
    });

    const response = await handler(
      new Request(
        'https://unirise.tw/api/analytics?from=2026-09-01&to=2026-09-03',
      ),
    );
    const payload = (await response.json()) as {
      unansweredQuestions: Array<{ question: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.unansweredQuestions[0].question).toBe(
      '請聯絡 [電子信箱已隱藏] 或 [電話已隱藏]',
    );
    expect(JSON.stringify(payload)).not.toContain('legacy@example.com');
    expect(JSON.stringify(payload)).not.toContain('06-3319283');
  });

  it('deletes and excludes chat questions older than 90 days during authenticated dashboard reads', async () => {
    const database = new AnalyticsDatabase();
    database.questions.push(
      {
        id: 'stale-gap',
        question: 'Old unanswered question',
        outcome: 'unanswered',
        source_ids_json: '[]',
        created_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'cutoff-gap',
        question: 'Question at the exact retention boundary',
        outcome: 'unanswered',
        source_ids_json: '[]',
        created_at: '2026-06-04T12:00:00.000Z',
      },
      {
        id: 'recent-gap',
        question: 'Recent unanswered question',
        outcome: 'unanswered',
        source_ids_json: '[]',
        created_at: '2026-09-01T00:00:00.000Z',
      },
    );
    const handler = createAnalyticsHandler({
      db: database.d1,
      authenticate: async () => ({
        id: 'owner',
        email: 'owner@example.com',
        role: 'admin',
      }),
    });

    const response = await handler(
      new Request(
        'https://unirise.tw/api/analytics?from=2026-01-01&to=2026-09-03',
      ),
    );
    const payload = (await response.json()) as {
      unansweredQuestions: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.unansweredQuestions).toEqual([
      expect.objectContaining({ id: 'recent-gap' }),
      expect.objectContaining({ id: 'cutoff-gap' }),
    ]);
    expect(database.questions.map((row) => row.id)).toEqual([
      'cutoff-gap',
      'recent-gap',
    ]);
  });

  it('uses inclusive Asia/Taipei calendar days for dashboard bounds', () => {
    expect(dashboardBounds({ from: '2026-09-01', to: '2026-09-01' })).toEqual({
      from: '2026-08-31T16:00:00.000Z',
      to: '2026-09-01T16:00:00.000Z',
    });
  });

  it('domain-separates visitor identifiers with a keyed server secret', async () => {
    const visitor = await hashVisitorIdentifier(
      '203.0.113.44',
      TEST_ANALYTICS_PEPPER,
      'chat-visitor',
    );
    const throttle = await hashVisitorIdentifier(
      '203.0.113.44',
      TEST_ANALYTICS_PEPPER,
      'analytics-throttle',
    );

    expect(visitor).toMatch(/^[a-f0-9]{64}$/);
    expect(visitor).not.toBe(throttle);
    expect(visitor).not.toBe(
      await hashVisitorIdentifier(
        '203.0.113.44',
        'different-analytics-pepper-at-least-32-characters',
        'chat-visitor',
      ),
    );
  });

  it.each([
    '我的密碼是 super-secret-123，請幫我登入',
    '信用卡是 4111 1111 1111 1111',
    '身分證 A123456789，地址台南市東區裕義路598號',
    'Please deliver to 123 Main Street, Springfield, CA 90210',
    '請寄到信義區松仁路 100 號',
  ])('refuses to persist broadly sensitive chat text: %s', async (question) => {
    const database = new AnalyticsDatabase();

    await recordChatOutcome(database.d1, {
      question,
      outcome: 'unanswered',
      sourceIds: [],
    });

    expect(database.questions).toEqual([]);
  });
});

describe('analytics route boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('does not prune expired chat questions for an unauthenticated read', async () => {
    const database = new AnalyticsDatabase();
    database.questions.push({
      id: 'stale-gap',
      question: 'Old unanswered question',
      outcome: 'unanswered',
      source_ids_json: '[]',
      created_at: '2026-05-01T00:00:00.000Z',
    });
    const handler = createAnalyticsHandler({
      db: database.d1,
      authenticate: async () => null,
    });

    const response = await handler(
      new Request(
        'https://unirise.tw/api/analytics?from=2026-01-01&to=2026-09-03',
      ),
    );

    expect(response.status).toBe(401);
    expect(database.questions.map((row) => row.id)).toEqual(['stale-gap']);
  });

  it('rejects dashboard data without an administrator session', async () => {
    const database = new AnalyticsDatabase();
    const handler = createAnalyticsHandler({
      db: database.d1,
      authenticate: async () => null,
    });

    const response = await handler(
      new Request(
        'https://unirise.tw/api/analytics?from=2026-09-01&to=2026-09-03',
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
  });

  it.each([
    ['http://localhost:3000/api/analytics', '/news'],
    ['https://unirise.tw/api/analytics', '/admin'],
    ['https://unirise.tw/api/analytics', '/admin/news'],
  ])('does not record excluded page traffic from %s%s', async (url, path) => {
    const database = new AnalyticsDatabase();
    const handler = createAnalyticsHandler({ db: database.d1 });

    const response = await handler(
      new Request(url, {
        method: 'POST',
        headers: {
          Origin: new URL(url).origin,
          Cookie: 'unirise_visitor=opaque-browser-id',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'page_view', path }),
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: false });
    expect(database.events).toEqual([]);
  });

  it('stores a public page event with only a hashed cookie identifier and allowlisted metadata', async () => {
    const database = new AnalyticsDatabase();
    const handler = createAnalyticsHandler({
      db: database.d1,
      hashPepper: TEST_ANALYTICS_PEPPER,
    });

    const response = await handler(
      new Request('https://unirise.tw/api/analytics', {
        method: 'POST',
        headers: {
          Origin: 'https://unirise.tw',
          Cookie: 'unirise_visitor=opaque-browser-id',
          'CF-Connecting-IP': '203.0.113.12',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'download_click',
          path: '/downloads?id=78',
          metadata: { downloadId: '78', email: 'secret@example.com' },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(database.events).toHaveLength(1);
    expect(database.events[0].visitor_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(database.events[0].visitor_hash).not.toBe('opaque-browser-id');
    expect(database.events[0]).toMatchObject({
      name: 'download_click',
      path: '/downloads?id=78',
      metadata_json: '{"downloadId":"78"}',
    });
    expect(JSON.stringify(database.events[0])).not.toContain(
      'secret@example.com',
    );
  });

  it('requires the exact same origin for a public event', async () => {
    const database = new AnalyticsDatabase();
    const handler = createAnalyticsHandler({ db: database.d1 });

    const response = await handler(
      new Request('https://unirise.tw/api/analytics', {
        method: 'POST',
        headers: {
          Origin: 'https://attacker.example',
          Cookie: 'unirise_visitor=opaque-browser-id',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'page_view', path: '/' }),
      }),
    );

    expect(response.status).toBe(403);
    expect(database.events).toEqual([]);
  });

  it('rejects an oversized public event body before storing it', async () => {
    const database = new AnalyticsDatabase();
    const handler = createAnalyticsHandler({ db: database.d1 });

    const response = await handler(
      new Request('https://unirise.tw/api/analytics', {
        method: 'POST',
        headers: {
          Origin: 'https://unirise.tw',
          Cookie: 'unirise_visitor=opaque-browser-id',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'page_view',
          path: '/',
          padding: 'x'.repeat(3_000),
        }),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'request_too_large',
    });
    expect(database.events).toEqual([]);
  });

  it('rate-limits repeated event writes for one anonymous visitor', async () => {
    const database = new AnalyticsDatabase();
    const handler = createAnalyticsHandler({
      db: database.d1,
      hashPepper: TEST_ANALYTICS_PEPPER,
    });
    const responses: Response[] = [];

    for (let attempt = 0; attempt < 61; attempt += 1) {
      responses.push(
        await handler(
          new Request('https://unirise.tw/api/analytics', {
            method: 'POST',
            headers: {
              Origin: 'https://unirise.tw',
              Cookie: 'unirise_visitor=rate-limited-browser-id',
              'CF-Connecting-IP': '203.0.113.13',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: 'page_view', path: '/news' }),
          }),
        ),
      );
    }

    expect(
      responses.slice(0, 60).every((response) => response.status === 202),
    ).toBe(true);
    expect(responses[60].status).toBe(429);
    expect(database.events).toHaveLength(60);
  });

  it('rejects unknown paths and download IDs that are not published', async () => {
    const database = new AnalyticsDatabase();
    const handler = createAnalyticsHandler({
      db: database.d1,
      hashPepper: TEST_ANALYTICS_PEPPER,
    });
    const headers = {
      Origin: 'https://unirise.tw',
      Cookie: 'unirise_visitor=browser-id',
      'CF-Connecting-IP': '203.0.113.12',
      'Content-Type': 'application/json',
    };

    const invalidPath = await handler(
      new Request('https://unirise.tw/api/analytics', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'page_view', path: '/made-up-page' }),
      }),
    );
    const unpublishedDownload = await handler(
      new Request('https://unirise.tw/api/analytics', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'download_click',
          path: '/downloads?id=999',
          metadata: { downloadId: '999' },
        }),
      }),
    );

    expect(invalidPath.status).toBe(400);
    expect(unpublishedDownload.status).toBe(400);
    expect(database.events).toEqual([]);
  });

  it('does not store free-text product or collection query parameters', async () => {
    const database = new AnalyticsDatabase();
    const handler = createAnalyticsHandler({
      db: database.d1,
      hashPepper: TEST_ANALYTICS_PEPPER,
    });
    const headers = {
      Origin: 'https://unirise.tw',
      Cookie: 'unirise_visitor=browser-id',
      'CF-Connecting-IP': '203.0.113.12',
      'Content-Type': 'application/json',
    };

    for (const path of [
      '/inquiry?product=buyer@example.com',
      '/downloads?collection=Confidential%20Project',
    ]) {
      const response = await handler(
        new Request('https://unirise.tw/api/analytics', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: 'page_view', path }),
        }),
      );
      expect(response.status).toBe(400);
    }

    expect(database.events).toEqual([]);
  });

  it('rate-limits forged unpublished download events before checking publication', async () => {
    const database = new AnalyticsDatabase();
    const handler = createAnalyticsHandler({
      db: database.d1,
      hashPepper: TEST_ANALYTICS_PEPPER,
    });
    const responses: Response[] = [];

    for (let attempt = 0; attempt < 61; attempt += 1) {
      responses.push(
        await handler(
          new Request('https://unirise.tw/api/analytics', {
            method: 'POST',
            headers: {
              Origin: 'https://unirise.tw',
              Cookie: `unirise_visitor=forged-download-${attempt}`,
              'CF-Connecting-IP': '203.0.113.77',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: 'download_click',
              path: '/downloads?id=999',
              metadata: { downloadId: '999' },
            }),
          }),
        ),
      );
    }

    expect(responses.slice(0, 60).every(({ status }) => status === 400)).toBe(
      true,
    );
    expect(responses[60].status).toBe(429);
    expect(database.events).toEqual([]);
  });

  it('throttles by a keyed edge identity even when the client rotates cookies', async () => {
    const database = new AnalyticsDatabase();
    const handler = createAnalyticsHandler({
      db: database.d1,
      hashPepper: TEST_ANALYTICS_PEPPER,
    });
    const responses: Response[] = [];

    for (let attempt = 0; attempt < 61; attempt += 1) {
      responses.push(
        await handler(
          new Request('https://unirise.tw/api/analytics', {
            method: 'POST',
            headers: {
              Origin: 'https://unirise.tw',
              Cookie: `unirise_visitor=rotated-${attempt}`,
              'CF-Connecting-IP': '203.0.113.12',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: 'page_view', path: '/news' }),
          }),
        ),
      );
    }
    expect(responses[60].status).toBe(429);
    expect(database.events).toHaveLength(60);
    expect(
      new Set(database.rateLimits.map((row) => row.visitor_hash)).size,
    ).toBe(1);
  });
});

describe('chat analytics integration', () => {
  it('records accepted unanswered questions without making analytics a chat dependency', async () => {
    const database = new AnalyticsDatabase();
    const handler = createChatHandler({
      db: database.d1,
      groqApiKey: 'unused-for-gap',
      isAllowed: async () => true,
      retrieveKnowledge: async () => [],
      analyticsHashPepper: TEST_ANALYTICS_PEPPER,
    });

    const response = await handler(
      new Request('https://unirise.tw/api/chat', {
        method: 'POST',
        headers: {
          Origin: 'https://unirise.tw',
          'CF-Connecting-IP': '203.0.113.44',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: '我的信箱是 buyer@example.com，公司地址在哪裡？',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(database.events.map((event) => event.name)).toEqual([
      'chat_question',
      'chat_unanswered',
    ]);
    expect(database.events[0].visitor_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(database.events)).not.toContain('203.0.113.44');
    expect(database.questions[0].question).toContain('[電子信箱已隱藏]');
  });
});

describe('question sanitizer', () => {
  it('limits control characters, whitespace, and length before storage', () => {
    const sanitized = sanitizeQuestion(`  ${'問題 '.repeat(200)}\u0007  `);

    expect(sanitized.length).toBeLessThanOrEqual(300);
    expect(sanitized).not.toContain('\u0007');
    expect(sanitized).not.toMatch(/\s{2,}/);
  });
});

describe('administrator login', () => {
  it('does not reveal or prefill the administrator allowlist address', () => {
    const html = renderToStaticMarkup(createElement(AdminLoginForm));

    expect(html).toContain('id="admin-email"');
    expect(html).not.toContain('value="hungyu@gmail.com"');
  });
});
