import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as verifyAdminCode } from '../app/api/admin/auth/verify-code/route';
import { createRequestCodeHandler } from '../app/api/admin/auth/request-code/route';
import { createKnowledgeAdminHandler } from '../app/api/admin/knowledge/route';
import { createAnalyticsHandler } from '../app/api/analytics/route';
import { createChatHandler } from '../app/api/chat/route';
import { createLeadsHandler } from '../app/api/leads/route';
import { env } from 'cloudflare:workers';

vi.mock('cloudflare:workers', () => ({ env: {} }));

const ADMIN_AUTH_PEPPER = 'admin-auth-test-pepper-at-least-32-characters';
const ANALYTICS_HASH_PEPPER = 'analytics-test-pepper-at-least-32-characters';

type Row = Record<string, unknown>;

function result<T>(results: T[] = [], changes = 0) {
  return {
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
  };
}

function compact(sql: string) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function insertRow(sql: string, values: unknown[]) {
  const match = sql.match(/\(([^)]+)\)\s*(?:values|select)/i);
  if (!match) throw new Error(`Cannot parse insert: ${sql}`);
  return Object.fromEntries(
    match[1]
      .split(',')
      .map((column) => column.trim())
      .map((column, index) => [column, values[index]]),
  );
}

class ReleaseStatement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly database: ReleaseDatabase,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    return result([], this.database.write(this.sql, this.values));
  }

  async first<T>() {
    return (
      (this.database.read(this.sql, this.values)[0] as T | undefined) ?? null
    );
  }

  async all<T>() {
    return result(this.database.read(this.sql, this.values) as T[]);
  }
}

class ReleaseDatabase {
  readonly users: Row[] = [
    { id: 'admin-1', email: 'hungyu@gmail.com', role: 'admin', enabled: 1 },
  ];
  readonly codes: Row[] = [];
  readonly sessions: Row[] = [];
  readonly knowledge: Row[] = [];
  readonly leads: Row[] = [];
  readonly events: Row[] = [];
  readonly questions: Row[] = [];
  readonly rateLimits: Row[] = [];

  readonly d1 = {
    prepare: (sql: string) =>
      new ReleaseStatement(sql, this) as unknown as D1PreparedStatement,
    batch: async (statements: D1PreparedStatement[]) => {
      const snapshots = [
        [this.knowledge, this.knowledge.map((row) => ({ ...row }))],
        [this.leads, this.leads.map((row) => ({ ...row }))],
        [this.events, this.events.map((row) => ({ ...row }))],
      ] as const;
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        return results;
      } catch (error) {
        for (const [table, snapshot] of snapshots) {
          table.splice(0, table.length, ...snapshot);
        }
        throw error;
      }
    },
  } as unknown as D1Database;

  read(sql: string, values: unknown[]) {
    const query = compact(sql);
    if (query.includes('from admin_users') && !query.includes('join')) {
      return this.users.filter(
        (row) => row.email === values[0] && row.enabled === 1,
      );
    }
    if (query.includes('from admin_login_codes c join admin_users u')) {
      const user = this.users.find(
        (row) => row.email === values[0] && row.enabled === 1,
      );
      if (!user) return [];
      const code = this.codes
        .filter((row) => row.admin_user_id === user.id && row.used_at == null)
        .sort((left, right) =>
          String(right.created_at).localeCompare(String(left.created_at)),
        )[0];
      return code
        ? [{ ...code, admin_id: user.id, email: user.email, role: user.role }]
        : [];
    }
    if (query.includes('from admin_sessions s join admin_users u')) {
      const session = this.sessions.find(
        (row) =>
          row.token_hash === values[0] &&
          row.revoked_at == null &&
          String(row.expires_at) > String(values[1]),
      );
      const user =
        session && this.users.find((row) => row.id === session.admin_user_id);
      return user && user.enabled === 1
        ? [{ id: user.id, email: user.email, role: user.role }]
        : [];
    }
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
      query.includes('from chat_knowledge') &&
      query.includes('where id = ?')
    ) {
      return this.knowledge.filter((row) => row.id === values[0]);
    }
    if (query.includes('from chat_knowledge') && query.includes('status = ?')) {
      return this.knowledge.filter((row) => row.status === values[0]);
    }
    if (query.includes('from chat_knowledge')) return this.knowledge;
    if (
      query.includes('from site_events') &&
      query.includes('unique_visitors')
    ) {
      const rows = this.rowsInRange(
        this.events,
        String(values[0]),
        String(values[1]),
        'occurred_at',
      );
      const count = (name: string) =>
        rows.filter((row) => row.name === name).length;
      return [
        {
          unique_visitors: new Set(
            rows
              .filter((row) => row.name === 'page_view')
              .map((row) => row.visitor_hash),
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
    if (query.includes('from site_events') && query.includes('group by path')) {
      const rows = this.rowsInRange(
        this.events,
        String(values[0]),
        String(values[1]),
        'occurred_at',
      ).filter((row) => row.name === values[2]);
      const grouped = new Map<string, number>();
      for (const row of rows) {
        const path = String(row.path);
        grouped.set(path, (grouped.get(path) ?? 0) + 1);
      }
      return [...grouped].map(([path, count]) => ({ path, count }));
    }
    if (query.includes('from chat_question_log')) {
      return this.rowsInRange(
        this.questions,
        String(values[0]),
        String(values[1]),
        'created_at',
      ).filter((row) => row.outcome === 'unanswered');
    }
    if (query.includes('from chat_leads')) {
      return this.rowsInRange(
        this.leads,
        String(values[0]),
        String(values[1]),
        'created_at',
      );
    }
    if (
      query.includes('from managed_news') ||
      query.includes('from managed_downloads')
    ) {
      return [];
    }
    throw new Error(`Unsupported release-test read SQL: ${sql}`);
  }

  write(sql: string, values: unknown[]) {
    const query = compact(sql);
    if (query.startsWith('insert into admin_login_codes')) {
      this.codes.push(insertRow(sql, values));
      return 1;
    }
    if (query.startsWith('update admin_login_codes set attempts_remaining')) {
      const code = this.codes.find(
        (row) =>
          row.id === values[0] &&
          row.used_at == null &&
          Number(row.attempts_remaining) > 0,
      );
      if (!code) return 0;
      code.attempts_remaining = Number(code.attempts_remaining) - 1;
      return 1;
    }
    if (query.startsWith('update admin_login_codes set used_at')) {
      const code = this.codes.find(
        (row) => row.id === values[1] && row.used_at == null,
      );
      if (!code) return 0;
      code.used_at = values[0];
      return 1;
    }
    if (query.startsWith('insert into admin_sessions')) {
      this.sessions.push(insertRow(sql, values));
      return 1;
    }
    if (query.startsWith('insert into chat_knowledge')) {
      const row = insertRow(sql, values);
      if (this.knowledge.some((item) => item.id === row.id)) return 0;
      this.knowledge.push(row);
      return 1;
    }
    if (query.startsWith('update chat_knowledge set status')) {
      const record = this.knowledge.find((row) => row.id === values[3]);
      if (!record) return 0;
      record.status = values[0];
      record.published_at = values[1];
      record.updated_at = values[2];
      return 1;
    }
    if (query.startsWith('insert into admin_audit_log')) return 1;
    if (query.startsWith('insert into chat_leads')) {
      this.leads.push(insertRow(sql, values));
      return 1;
    }
    if (query.startsWith('insert into site_events')) {
      this.events.push(insertRow(sql, values));
      return 1;
    }
    if (query.startsWith('insert into chat_question_log')) {
      this.questions.push(insertRow(sql, values));
      return 1;
    }
    if (query.startsWith('update chat_leads set email_delivered')) {
      const lead = this.leads.find((row) => row.id === values[2]);
      if (!lead) return 0;
      lead.email_delivered = values[0];
      lead.updated_at = values[1];
      return 1;
    }
    if (query.startsWith('delete from site_chat_rate_limits')) return 0;
    if (query.startsWith('delete from chat_question_log')) return 0;
    throw new Error(`Unsupported release-test write SQL: ${sql}`);
  }

  private rowsInRange(rows: Row[], from: string, to: string, field: string) {
    return rows.filter(
      (row) => String(row[field]) >= from && String(row[field]) < to,
    );
  }
}

function jsonRequest(url: string, body: unknown, cookie?: string) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: new URL(url).origin,
      'CF-Connecting-IP': '203.0.113.8',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('admin, chatbot, lead, and analytics release flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('uses the API handlers for an admin session, publication, chat source, quote lead, and conversion metric', async () => {
    const database = new ReleaseDatabase();
    Object.assign(env as object, {
      DB: database.d1,
      ADMIN_AUTH_PEPPER,
    });
    const background: Promise<unknown>[] = [];
    let loginCode = '';
    const requestCode = createRequestCodeHandler({
      db: database.d1,
      codePepper: ADMIN_AUTH_PEPPER,
      mailer: async ({ code }) => {
        loginCode = code;
      },
      waitUntil: (promise) => background.push(promise),
    });
    const requestCodeResponse = await requestCode(
      jsonRequest('https://unirise.example/api/admin/auth/request-code', {
        email: 'hungyu@gmail.com',
      }),
    );
    expect(requestCodeResponse.status).toBe(202);
    await Promise.all(background);

    const verifyResponse = await verifyAdminCode(
      jsonRequest('https://unirise.example/api/admin/auth/verify-code', {
        email: 'hungyu@gmail.com',
        code: loginCode,
      }),
    );
    expect(verifyResponse.status).toBe(200);
    const sessionCookie = verifyResponse.headers
      .get('Set-Cookie')
      ?.split(';')[0];
    expect(sessionCookie).toMatch(/^unirise_admin_session=/);

    const knowledge = createKnowledgeAdminHandler(database.d1);
    const createKnowledge = await knowledge(
      jsonRequest(
        'https://unirise.example/api/admin/knowledge',
        {
          id: 'release-source',
          title: 'XAVIS X-ray 檢測方案',
          href: '/catalog?type=brand&id=2',
          body: 'X-ray 檢測設備可用於食品異物檢查。',
          tags: ['xray', '食品'],
          status: 'draft',
        },
        sessionCookie,
      ),
    );
    expect(createKnowledge.status).toBe(201);
    const publishKnowledge = await knowledge(
      new Request('https://unirise.example/api/admin/knowledge', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://unirise.example',
          Cookie: sessionCookie ?? '',
        },
        body: JSON.stringify({ id: 'release-source', status: 'published' }),
      }),
    );
    expect(publishKnowledge.status).toBe(200);

    const analytics = createAnalyticsHandler({
      db: database.d1,
      hashPepper: ANALYTICS_HASH_PEPPER,
    });
    for (const visitor of ['visitor-a', 'visitor-b']) {
      const pageView = await analytics(
        jsonRequest(
          'https://unirise.example/api/analytics',
          { name: 'page_view', path: '/' },
          `unirise_visitor=${visitor}`,
        ),
      );
      expect(pageView.status).toBe(202);
    }

    const chat = createChatHandler({
      db: database.d1,
      groqApiKey: 'test-groq-key',
      isAllowed: async () => true,
      analyticsHashPepper: ANALYTICS_HASH_PEPPER,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '可用於食品異物檢查。' } }],
          }),
          { status: 200 },
        ),
    });
    const chatResponse = await chat(
      jsonRequest('https://unirise.example/api/chat', {
        message: '請問 X-ray 檢測方案？',
      }),
    );
    expect(chatResponse.status).toBe(200);
    await expect(chatResponse.json()).resolves.toMatchObject({
      sources: [
        {
          title: 'XAVIS X-ray 檢測方案',
          href: '/catalog?type=brand&id=2',
        },
      ],
    });

    const leads = createLeadsHandler({
      db: database.d1,
      mailer: async () => undefined,
      isRequestAllowed: async () => true,
      analyticsHashPepper: ANALYTICS_HASH_PEPPER,
    });
    const leadResponse = await leads(
      jsonRequest('https://unirise.example/api/leads', {
        requestType: 'quote',
        name: 'Lin',
        email: 'buyer@example.com',
        message: '請提供 X-ray 檢測設備報價。',
        sourcePath: '/catalog?type=brand&id=2',
      }),
    );
    expect(leadResponse.status).toBe(201);
    await expect(leadResponse.json()).resolves.toEqual({
      accepted: true,
      followUpDelayed: false,
    });

    const dashboard = await analytics(
      new Request(
        'https://unirise.example/api/analytics?from=2026-09-02&to=2026-09-02',
        { headers: { Cookie: sessionCookie ?? '' } },
      ),
    );
    expect(dashboard.status).toBe(200);
    await expect(dashboard.json()).resolves.toMatchObject({
      metrics: { uniqueVisitors: 2, leads: 1, leadConversionRate: 0.5 },
    });
    expect(database.leads).toHaveLength(1);
  });

  it('returns neutral acceptance without issuing a login code outside the allowlist', async () => {
    const database = new ReleaseDatabase();
    const background: Promise<unknown>[] = [];
    const delivered: string[] = [];
    const requestCode = createRequestCodeHandler({
      db: database.d1,
      codePepper: ADMIN_AUTH_PEPPER,
      mailer: async ({ code }) => {
        delivered.push(code);
      },
      waitUntil: (promise) => background.push(promise),
    });

    const response = await requestCode(
      jsonRequest('https://unirise.example/api/admin/auth/request-code', {
        email: 'outside@example.com',
      }),
    );
    await Promise.all(background);

    expect(response.status).toBe(202);
    expect(delivered).toEqual([]);
    expect(database.codes).toEqual([]);
  });
});
