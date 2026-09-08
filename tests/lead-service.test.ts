import { describe, expect, it, vi } from 'vitest';
import { createLeadsHandler } from '../app/api/leads/route';
import {
  createChatLead,
  isLeadSubmissionRequestAllowed,
  type LeadNotification,
} from '../lib/lead-service';
import { sendLeadNotification } from '../lib/resend';

vi.mock('cloudflare:workers', () => ({ env: {} }));

const TEST_ANALYTICS_PEPPER = 'analytics-test-pepper-at-least-32-characters';

type Row = Record<string, unknown>;

const d1Result = (changes = 0) => ({
  success: true as const,
  results: [],
  meta: {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: changes,
    last_row_id: 0,
    changed_db: changes > 0,
    changes,
  },
});

class LeadPreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly database: LeadDatabase,
  ) {}

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  async run() {
    return d1Result(this.database.write(this.sql, this.values));
  }

  async first<T>(): Promise<T | null> {
    return this.database.readFirst(this.sql, this.values) as T | null;
  }
}

class LeadDatabase {
  readonly leads: Row[] = [];
  readonly events: Row[] = [];
  readonly rateLimits: Row[] = [];

  readonly d1 = {
    prepare: (sql: string) =>
      new LeadPreparedStatement(sql, this) as unknown as D1PreparedStatement,
    batch: async (statements: D1PreparedStatement[]) => {
      const leads = this.leads.map((row) => ({ ...row }));
      const events = this.events.map((row) => ({ ...row }));
      try {
        const results = [];
        for (const statement of statements) {
          results.push(
            await (statement as unknown as LeadPreparedStatement).run(),
          );
        }
        return results;
      } catch (error) {
        this.leads.splice(0, this.leads.length, ...leads);
        this.events.splice(0, this.events.length, ...events);
        throw error;
      }
    },
  } as unknown as D1Database;

  constructor(
    private readonly options: {
      failEventWrite?: boolean;
      failDeliveryTracking?: boolean;
    } = {},
  ) {}

  readFirst(sql: string, values: unknown[]): Row | null {
    const query = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (query.startsWith('insert into site_chat_rate_limits')) {
      const [bucket, visitorHash] = values.map(String);
      const existing = this.rateLimits.find(
        (row) => row.bucket === bucket && row.visitor_hash === visitorHash,
      );
      if (existing) {
        existing.request_count = Number(existing.request_count) + 1;
        return { request_count: existing.request_count };
      }
      this.rateLimits.push({
        bucket,
        visitor_hash: visitorHash,
        request_count: 1,
      });
      return { request_count: 1 };
    }
    throw new Error(`LeadDatabase does not support read SQL: ${sql}`);
  }

  write(sql: string, values: unknown[]): number {
    const query = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (query.startsWith('insert into chat_leads')) {
      const visitorHash = String(values.at(-3));
      const cutoff = String(values.at(-2));
      const limit = Number(values.at(-1));
      const recentLeadCount = this.leads.filter(
        (lead) =>
          lead.visitor_hash === visitorHash &&
          String(lead.created_at) >= cutoff,
      ).length;
      if (recentLeadCount >= limit) return 0;
      this.leads.push(rowFromInsert(sql, values));
      return 1;
    }
    if (query.startsWith('insert into site_events')) {
      if (this.options.failEventWrite) throw new Error('event write failed');
      const leadId = values.at(-1);
      if (!this.leads.some((row) => row.id === leadId)) return 0;
      this.events.push(rowFromInsert(sql, values));
      return 1;
    }
    if (query.startsWith('update chat_leads set email_delivered')) {
      if (this.options.failDeliveryTracking)
        throw new Error('delivery tracking failed');
      const lead = this.leads.find((row) => row.id === values[2]);
      if (!lead) return 0;
      lead.email_delivered = values[0];
      lead.updated_at = values[1];
      return 1;
    }
    if (query.startsWith('delete from site_chat_rate_limits')) return 0;
    throw new Error(`LeadDatabase does not support SQL: ${sql}`);
  }
}

function rowFromInsert(sql: string, values: unknown[]): Row {
  const match = sql.match(/\(([^)]+)\)\s*(?:values|select)/i);
  if (!match) throw new Error(`Cannot parse INSERT: ${sql}`);
  const columns = match[1].split(',').map((column) => column.trim());
  return Object.fromEntries(
    columns.map((column, index) => [column, values[index]]),
  );
}

function captureMailer(deliveries: LeadNotification[]) {
  return async (notification: LeadNotification) => {
    deliveries.push(notification);
  };
}

describe('chat lead service', () => {
  it('uses keyed, domain-separated hashes for lead records and edge throttles', async () => {
    const database = new LeadDatabase();

    await isLeadSubmissionRequestAllowed(
      database.d1,
      '203.0.113.4',
      TEST_ANALYTICS_PEPPER,
    );
    await createChatLead(
      database.d1,
      {
        requestType: 'quote',
        name: 'Lin',
        email: 'buyer@example.com',
        message: 'Please provide a quote.',
      },
      { sourcePath: '/', visitorIdentifier: '203.0.113.4' },
      async () => undefined,
      TEST_ANALYTICS_PEPPER,
    );

    expect(database.leads[0].visitor_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(database.rateLimits[0].visitor_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(database.leads[0].visitor_hash).not.toBe(
      database.rateLimits[0].visitor_hash,
    );
  });

  it('stores a valid quote lead, records its event, and requests the owner notification', async () => {
    const database = new LeadDatabase();
    const deliveries: LeadNotification[] = [];

    const result = await createChatLead(
      database.d1,
      {
        requestType: 'quote',
        name: ' Lin ',
        email: ' BUYER@example.com ',
        company: 'Example Foods',
        message: 'Need an X-ray inspection quote.',
        topic: 'X-ray inspection',
      },
      { sourcePath: '/catalog?id=2', visitorIdentifier: '203.0.113.4' },
      captureMailer(deliveries),
      TEST_ANALYTICS_PEPPER,
    );

    expect(result.emailDelivered).toBe(true);
    expect(database.leads).toHaveLength(1);
    expect(database.leads[0]).toMatchObject({
      id: result.id,
      request_type: 'quote',
      name: 'Lin',
      email: 'buyer@example.com',
      company: 'Example Foods',
      message: 'Need an X-ray inspection quote.',
      source_path: '/catalog?id=2',
      status: 'new',
      email_delivered: 1,
    });
    expect(database.leads[0].visitor_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(database.leads[0].visitor_hash).not.toBe('203.0.113.4');
    expect(database.events).toHaveLength(1);
    expect(database.events[0]).toMatchObject({
      name: 'inquiry_submitted',
      path: '/catalog?id=2',
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      to: 'hungyu@gmail.com',
      replyTo: 'buyer@example.com',
    });
    expect(deliveries[0].text).toContain('Need an X-ray inspection quote.');
  });

  it.each([
    ['missing name', { name: '' }],
    ['invalid email', { email: 'bad' }],
    ['missing request details', { message: '   ' }],
  ])('rejects a lead with %s', async (_case, replacement) => {
    const database = new LeadDatabase();
    const deliveries: LeadNotification[] = [];

    await expect(
      createChatLead(
        database.d1,
        {
          requestType: 'quote',
          name: 'Lin',
          email: 'buyer@example.com',
          message: 'Please contact me.',
          ...replacement,
        },
        { sourcePath: '/', visitorIdentifier: 'visitor-a' },
        captureMailer(deliveries),
        TEST_ANALYTICS_PEPPER,
      ),
    ).rejects.toThrow('invalid_lead');
    expect(database.leads).toEqual([]);
    expect(deliveries).toEqual([]);
  });

  it.each([
    'buyer@example..com',
    'buyer@-example.com',
    'buyer@example-.com',
    'buyer@exam_ple.com',
  ])('rejects an email with invalid domain labels: %s', async (email) => {
    const database = new LeadDatabase();

    await expect(
      createChatLead(
        database.d1,
        {
          requestType: 'quote',
          name: 'Lin',
          email,
          message: 'Please provide a quote.',
        },
        { sourcePath: '/', visitorIdentifier: 'visitor-domain' },
        async () => undefined,
        TEST_ANALYTICS_PEPPER,
      ),
    ).rejects.toThrow('invalid_lead');
    expect(database.leads).toEqual([]);
  });

  it('rolls back the lead and suppresses mail when the event write fails', async () => {
    const database = new LeadDatabase({ failEventWrite: true });
    const deliveries: LeadNotification[] = [];

    await expect(
      createChatLead(
        database.d1,
        {
          requestType: 'quote',
          name: 'Lin',
          email: 'buyer@example.com',
          message: 'Please provide a quote.',
        },
        { sourcePath: '/', visitorIdentifier: 'visitor-atomic' },
        captureMailer(deliveries),
        TEST_ANALYTICS_PEPPER,
      ),
    ).rejects.toThrow('event write failed');
    expect(database.leads).toEqual([]);
    expect(database.events).toEqual([]);
    expect(deliveries).toEqual([]);
  });

  it('retains the stored lead and event when notification delivery fails', async () => {
    const database = new LeadDatabase();

    const result = await createChatLead(
      database.d1,
      {
        requestType: 'specialist',
        name: 'Chen',
        email: 'chen@example.com',
        message: 'Please have a specialist call me.',
      },
      { sourcePath: '/', visitorIdentifier: 'visitor-b' },
      async () => {
        throw new Error('mail unavailable');
      },
      TEST_ANALYTICS_PEPPER,
    );

    expect(result.emailDelivered).toBe(false);
    expect(database.leads).toHaveLength(1);
    expect(database.leads[0]).toMatchObject({
      request_type: 'specialist',
      email_delivered: 0,
    });
    expect(database.events).toHaveLength(1);
  });

  it('reports delivered mail even when updating its tracking flag fails', async () => {
    const database = new LeadDatabase({ failDeliveryTracking: true });

    const result = await createChatLead(
      database.d1,
      {
        requestType: 'quote',
        name: 'Lin',
        email: 'buyer@example.com',
        message: 'Please provide a quote.',
      },
      { sourcePath: '/', visitorIdentifier: 'visitor-tracking' },
      async () => undefined,
      TEST_ANALYTICS_PEPPER,
    );

    expect(result.emailDelivered).toBe(true);
    expect(database.leads).toHaveLength(1);
    expect(database.leads[0].email_delivered).toBe(0);
  });
});

describe('chat lead route protection', () => {
  const validBody = {
    requestType: 'quote',
    name: 'Lin',
    email: 'buyer@example.com',
    message: 'Please provide a quote.',
    sourcePath: '/',
  };

  function leadRequest(
    origin?: string,
    body: string = JSON.stringify(validBody),
    headersOverride: Record<string, string> = {},
  ) {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.8',
      ...headersOverride,
    });
    if (origin) headers.set('Origin', origin);
    return new Request('https://unirise.tw/api/leads', {
      method: 'POST',
      headers,
      body,
    });
  }

  it('fails closed when the server-only analytics hash secret is missing', async () => {
    const database = new LeadDatabase();
    const handler = createLeadsHandler({
      db: database.d1,
      mailer: async () => undefined,
    });

    const response = await handler(leadRequest('https://unirise.tw'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'lead_unavailable',
    });
    expect(database.rateLimits).toEqual([]);
    expect(database.leads).toEqual([]);
  });

  it.each([undefined, 'https://attacker.example'])(
    'rejects a submission without the exact site origin (%s)',
    async (origin) => {
      const database = new LeadDatabase();
      const handler = createLeadsHandler({
        db: database.d1,
        mailer: async () => undefined,
        analyticsHashPepper: TEST_ANALYTICS_PEPPER,
      });

      const response = await handler(leadRequest(origin));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: 'origin_not_allowed',
      });
      expect(database.leads).toEqual([]);
    },
  );

  it('rejects malformed JSON after reserving hashed edge-throttle capacity', async () => {
    const database = new LeadDatabase();
    const handler = createLeadsHandler({
      db: database.d1,
      mailer: async () => undefined,
      analyticsHashPepper: TEST_ANALYTICS_PEPPER,
    });

    const response = await handler(leadRequest('https://unirise.tw', '{'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_request',
    });
    expect(database.rateLimits).toHaveLength(1);
    expect(database.rateLimits[0].visitor_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(database.rateLimits[0].visitor_hash).not.toBe('203.0.113.8');
  });

  it('rejects an oversized body before parsing it', async () => {
    const database = new LeadDatabase();
    const handler = createLeadsHandler({
      db: database.d1,
      mailer: async () => undefined,
      analyticsHashPepper: TEST_ANALYTICS_PEPPER,
    });

    const response = await handler(
      leadRequest('https://unirise.tw', '{', {
        'Content-Length': '20000',
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'request_too_large',
    });
  });

  it('applies the edge throttle before parsing another malformed body', async () => {
    const database = new LeadDatabase();
    const handler = createLeadsHandler({
      db: database.d1,
      mailer: async () => undefined,
      analyticsHashPepper: TEST_ANALYTICS_PEPPER,
    });

    const responses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(await handler(leadRequest('https://unirise.tw', '{')));
    }

    expect(
      responses.slice(0, 10).every((response) => response.status === 400),
    ).toBe(true);
    expect(responses[10].status).toBe(429);
    await expect(responses[10].json()).resolves.toEqual({
      error: 'rate_limited',
    });
  });

  it('rate-limits repeated submissions by a hashed visitor identifier', async () => {
    const database = new LeadDatabase();
    const handler = createLeadsHandler({
      db: database.d1,
      mailer: async () => undefined,
      analyticsHashPepper: TEST_ANALYTICS_PEPPER,
    });

    const responses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      responses.push(await handler(leadRequest('https://unirise.tw')));
    }

    expect(responses.map((response) => response.status)).toEqual([
      201, 201, 201, 429,
    ]);
    expect(database.leads).toHaveLength(3);
    expect(
      database.leads.every((lead) => lead.visitor_hash !== '203.0.113.8'),
    ).toBe(true);
  });

  it('acknowledges a stored lead safely when route mail delivery fails', async () => {
    const database = new LeadDatabase();
    const handler = createLeadsHandler({
      db: database.d1,
      mailer: async () => {
        throw new Error('mail unavailable');
      },
      analyticsHashPepper: TEST_ANALYTICS_PEPPER,
    });

    const response = await handler(leadRequest('https://unirise.tw'));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      followUpDelayed: true,
    });
    expect(database.leads).toHaveLength(1);
    expect(database.events).toHaveLength(1);
  });
});

describe('Resend lead delivery', () => {
  it('sets a delivery timeout while preserving the exact recipient and body', async () => {
    let request: RequestInit | undefined;
    const fetchStub = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        request = init;
        return new Response(null, { status: 202 });
      },
    );

    await sendLeadNotification(
      {
        to: 'hungyu@gmail.com',
        replyTo: 'buyer@example.com',
        subject: 'New lead',
        text: 'Lead details only',
      },
      {
        apiKey: 'resend-secret',
        fromEmail: 'leads@unirise.tw',
        fetch: fetchStub,
      },
    );

    expect(request?.signal).toBeInstanceOf(AbortSignal);
    if (typeof request?.body !== 'string')
      throw new Error('Expected a JSON string request body');
    expect(JSON.parse(request.body)).toMatchObject({
      to: ['hungyu@gmail.com'],
      reply_to: 'buyer@example.com',
      text: 'Lead details only',
    });
  });
});
