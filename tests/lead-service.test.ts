import { describe, expect, it, vi } from 'vitest';
import { createLeadsHandler } from '../app/api/leads/route';
import { createChatLead, type LeadNotification } from '../lib/lead-service';

vi.mock('cloudflare:workers', () => ({ env: {} }));

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
}

class LeadDatabase {
  readonly leads: Row[] = [];
  readonly events: Row[] = [];

  readonly d1 = {
    prepare: (sql: string) =>
      new LeadPreparedStatement(sql, this) as unknown as D1PreparedStatement,
  } as unknown as D1Database;

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
      this.events.push(rowFromInsert(sql, values));
      return 1;
    }
    if (query.startsWith('update chat_leads set email_delivered')) {
      const lead = this.leads.find((row) => row.id === values[2]);
      if (!lead) return 0;
      lead.email_delivered = values[0];
      lead.updated_at = values[1];
      return 1;
    }
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
      ),
    ).rejects.toThrow('invalid_lead');
    expect(database.leads).toEqual([]);
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
    );

    expect(result.emailDelivered).toBe(false);
    expect(database.leads).toHaveLength(1);
    expect(database.leads[0]).toMatchObject({
      request_type: 'specialist',
      email_delivered: 0,
    });
    expect(database.events).toHaveLength(1);
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

  function leadRequest(origin?: string) {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.8',
    });
    if (origin) headers.set('Origin', origin);
    return new Request('https://unirise.tw/api/leads', {
      method: 'POST',
      headers,
      body: JSON.stringify(validBody),
    });
  }

  it.each([undefined, 'https://attacker.example'])(
    'rejects a submission without the exact site origin (%s)',
    async (origin) => {
      const database = new LeadDatabase();
      const handler = createLeadsHandler({
        db: database.d1,
        mailer: async () => undefined,
      });

      const response = await handler(leadRequest(origin));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: 'origin_not_allowed',
      });
      expect(database.leads).toEqual([]);
    },
  );

  it('rate-limits repeated submissions by a hashed visitor identifier', async () => {
    const database = new LeadDatabase();
    const handler = createLeadsHandler({
      db: database.d1,
      mailer: async () => undefined,
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
});
