import { describe, expect, it } from 'vitest';
import { createAdminLeadsHandler } from '../app/api/admin/leads/route';

class Statement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly database: TestDatabase,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    if (this.sql.includes('SELECT status FROM chat_leads')) {
      const lead = this.database.leads.get(String(this.values[0]));
      return (lead ? { status: lead.status } : null) as T | null;
    }
    return null;
  }

  async run() {
    if (this.sql.includes('UPDATE chat_leads')) {
      const [status, updatedAt, id] = this.values as [string, string, string];
      const lead = this.database.leads.get(id);
      if (lead) {
        lead.status = status;
        lead.updatedAt = updatedAt;
      }
    }
    if (this.sql.includes('INSERT INTO admin_audit_log')) {
      this.database.audit.push({
        action: String(this.values[2]),
        targetId: String(this.values[4]),
        detail: String(this.values[5]),
      });
    }
    return { success: true, results: [], meta: { changes: 1 } };
  }
}

class TestDatabase {
  readonly leads = new Map([
    ['lead-1', { status: 'new', updatedAt: '' }],
  ]);
  readonly audit: Array<{ action: string; targetId: string; detail: string }> = [];
  readonly d1 = {
    prepare: (sql: string) => new Statement(sql, this) as unknown as D1PreparedStatement,
    batch: async (statements: D1PreparedStatement[]) =>
      Promise.all(statements.map((statement) => statement.run())),
  } as unknown as D1Database;
}

describe('administrator lead status updates', () => {
  it('updates a lead and records the administrator action', async () => {
    const database = new TestDatabase();
    const handler = createAdminLeadsHandler(
      database.d1,
      async () => ({ id: 'admin-1', email: 'hungyu@gmail.com', role: 'admin' }),
    );

    const response = await handler(
      new Request('https://unirise.example/api/admin/leads', {
        method: 'PATCH',
        headers: {
          Origin: 'https://unirise.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: 'lead-1', status: 'contacted' }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ updated: true });
    expect(database.leads.get('lead-1')).toMatchObject({
      status: 'contacted',
    });
    expect(database.audit).toEqual([
      expect.objectContaining({
        action: 'lead.status_updated',
        targetId: 'lead-1',
      }),
    ]);
  });
});
