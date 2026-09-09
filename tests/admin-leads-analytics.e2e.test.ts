import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatHandler } from '../app/api/chat/route';
import { getDashboardMetrics, recordEvent } from '../lib/analytics';
import { requestAdminCode, verifyAdminCode } from '../lib/admin-auth';
import { createChatLead } from '../lib/lead-service';

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
  readonly knowledge: Row[] = [
    {
      id: 'release-source',
      title: 'XAVIS X-ray 檢測方案',
      href: '/catalog?type=brand&id=2',
      body: 'X-ray 檢測設備可用於食品異物檢查。',
      tags_json: '["xray","食品"]',
      status: 'published',
      published_at: '2026-09-02T00:00:00.000Z',
    },
  ];
  readonly leads: Row[] = [];
  readonly events: Row[] = [];
  readonly questions: Row[] = [];

  readonly d1 = {
    prepare: (sql: string) =>
      new ReleaseStatement(sql, this) as unknown as D1PreparedStatement,
    batch: async (statements: D1PreparedStatement[]) => {
      const leadSnapshot = this.leads.map((row) => ({ ...row }));
      const eventSnapshot = this.events.map((row) => ({ ...row }));
      try {
        return await Promise.all(
          statements.map((statement) => statement.run()),
        );
      } catch (error) {
        this.leads.splice(0, this.leads.length, ...leadSnapshot);
        this.events.splice(0, this.events.length, ...eventSnapshot);
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
    if (query.includes('from chat_knowledge')) {
      return this.knowledge.filter((row) => row.status === values[0]);
    }
    if (
      query.includes('from site_events') &&
      query.includes('unique_visitors')
    ) {
      const [from, to] = values.map(String);
      const rows = this.events.filter(
        (row) =>
          String(row.occurred_at) >= from && String(row.occurred_at) < to,
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
    throw new Error(`Unsupported release-test write SQL: ${sql}`);
  }
}

describe('admin, chatbot, lead, and analytics release flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('authenticates the allowlisted admin, answers from published knowledge, saves a quote lead, and reports conversion', async () => {
    const database = new ReleaseDatabase();
    let loginCode = '';

    await requestAdminCode(
      database.d1,
      'hungyu@gmail.com',
      'admin-browser',
      async ({ code }) => {
        loginCode = code;
      },
      ADMIN_AUTH_PEPPER,
    );
    const admin = await verifyAdminCode(
      database.d1,
      'hungyu@gmail.com',
      loginCode,
      new Date(),
      ADMIN_AUTH_PEPPER,
    );
    expect(admin).toMatchObject({ email: 'hungyu@gmail.com', role: 'admin' });

    await recordEvent(database.d1, {
      visitorHash: 'visitor-a',
      name: 'page_view',
      path: '/',
    });
    await recordEvent(database.d1, {
      visitorHash: 'visitor-b',
      name: 'page_view',
      path: '/catalog',
    });
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
      new Request('https://unirise.example/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.8',
        },
        body: JSON.stringify({ message: '請問 X-ray 檢測方案？' }),
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

    await expect(
      createChatLead(
        database.d1,
        {
          requestType: 'quote',
          name: 'Lin',
          email: 'buyer@example.com',
          message: '請提供 X-ray 檢測設備報價。',
        },
        {
          sourcePath: '/catalog?type=brand&id=2',
          visitorIdentifier: '203.0.113.8',
        },
        async (notification) => {
          expect(notification.to).toBe('hungyu@gmail.com');
        },
        ANALYTICS_HASH_PEPPER,
      ),
    ).resolves.toMatchObject({ emailDelivered: true });

    await expect(
      getDashboardMetrics(database.d1, {
        from: '2026-09-02',
        to: '2026-09-02',
      }),
    ).resolves.toMatchObject({
      uniqueVisitors: 2,
      leads: 1,
      leadConversionRate: 0.5,
    });
    expect(database.leads).toHaveLength(1);
    expect(database.questions).toHaveLength(1);
  });

  it('does not issue an administrator code for an address outside the allowlist', async () => {
    const database = new ReleaseDatabase();
    const delivered: string[] = [];

    await expect(
      requestAdminCode(
        database.d1,
        'outside@example.com',
        'unknown-browser',
        async ({ code }) => {
          delivered.push(code);
        },
        ADMIN_AUTH_PEPPER,
      ),
    ).resolves.toEqual({ accepted: true });
    expect(delivered).toEqual([]);
    expect(database.codes).toEqual([]);
  });
});
