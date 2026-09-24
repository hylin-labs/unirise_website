import { describe, expect, it } from 'vitest';
import { createAdminLineContactsHandler } from '../app/api/admin/line-contacts/route';
import { normalizeLineUrl, parseLineContactInput } from '../lib/line-contacts';

type StoredContact = {
  id: string;
  labelZh: string;
  labelEn: string;
  lineUrl: string;
  enabled: boolean;
  displayOrder: number;
  updatedAt: string;
};

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

  async all<T>() {
    if (!this.sql.includes('FROM site_line_contacts'))
      return { results: [] as T[] };
    const includeDisabled = !this.sql.includes('WHERE enabled = 1');
    const records = [...this.database.contacts.values()]
      .filter((contact) => includeDisabled || contact.enabled)
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((contact) => ({
        id: contact.id,
        label_zh: contact.labelZh,
        label_en: contact.labelEn,
        line_url: contact.lineUrl,
        enabled: contact.enabled ? 1 : 0,
        display_order: contact.displayOrder,
        updated_at: contact.updatedAt,
      }));
    return { results: records as T[] };
  }

  async run() {
    if (this.sql.includes('INSERT INTO site_line_contacts')) {
      const [
        id,
        labelZh,
        labelEn,
        lineUrl,
        enabled,
        displayOrder,
        createdAt,
        updatedAt,
      ] = this.values as [
        string,
        string,
        string,
        string,
        number,
        number,
        string,
        string,
      ];
      this.database.contacts.set(id, {
        id,
        labelZh,
        labelEn,
        lineUrl,
        enabled: enabled === 1,
        displayOrder,
        updatedAt: updatedAt ?? createdAt,
      });
    }
    if (this.sql.includes('UPDATE site_line_contacts')) {
      const [labelZh, labelEn, lineUrl, enabled, displayOrder, updatedAt, id] =
        this.values as [string, string, string, number, number, string, string];
      const contact = this.database.contacts.get(id);
      if (!contact) return { success: true, results: [], meta: { changes: 0 } };
      Object.assign(contact, {
        labelZh,
        labelEn,
        lineUrl,
        enabled: enabled === 1,
        displayOrder,
        updatedAt,
      });
    }
    if (this.sql.includes('DELETE FROM site_line_contacts')) {
      const deleted = this.database.contacts.delete(String(this.values[0]));
      return { success: true, results: [], meta: { changes: deleted ? 1 : 0 } };
    }
    if (this.sql.includes('INSERT INTO admin_audit_log')) {
      this.database.audit.push({
        action: String(this.values[2]),
        targetId: String(this.values[4]),
      });
    }
    return { success: true, results: [], meta: { changes: 1 } };
  }
}

class TestDatabase {
  readonly contacts = new Map<string, StoredContact>();
  readonly audit: Array<{ action: string; targetId: string }> = [];
  readonly d1 = {
    prepare: (sql: string) =>
      new Statement(sql, this) as unknown as D1PreparedStatement,
    batch: async (statements: D1PreparedStatement[]) =>
      Promise.all(statements.map((statement) => statement.run())),
  } as unknown as D1Database;
}

const admin = async () => ({
  id: 'admin-1',
  email: 'hungyu@gmail.com',
  role: 'admin' as const,
});
const contact = {
  labelZh: '業務聯絡',
  labelEn: 'Sales contact',
  lineUrl: 'https://line.me/ti/p/Rg3ax2MQJn',
  enabled: true,
  displayOrder: 1,
};

describe('LINE 聯絡設定', () => {
  it('只接受安全的 LINE 加好友連結', () => {
    expect(normalizeLineUrl('https://lin.ee/abc123')).toBe(
      'https://lin.ee/abc123',
    );
    expect(() => normalizeLineUrl('https://example.com/line')).toThrow(
      'LINE link',
    );
    expect(() => normalizeLineUrl('http://line.me/ti/p/test')).toThrow(
      'LINE link',
    );
    expect(() => parseLineContactInput({ ...contact, extra: true })).toThrow(
      'invalid_request',
    );
  });

  it('管理員可新增、更新與刪除多個聯絡窗口，並留下稽核紀錄', async () => {
    const database = new TestDatabase();
    const handler = createAdminLineContactsHandler(database.d1, admin);
    const create = await handler(
      new Request('https://unirise.example/api/admin/line-contacts', {
        method: 'POST',
        headers: {
          Origin: 'https://unirise.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contact),
      }),
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { contact: StoredContact };
    expect(created.contact).toMatchObject(contact);
    expect(database.contacts.size).toBe(1);

    const update = await handler(
      new Request('https://unirise.example/api/admin/line-contacts', {
        method: 'PUT',
        headers: {
          Origin: 'https://unirise.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: created.contact.id,
          ...contact,
          enabled: false,
          displayOrder: 3,
        }),
      }),
    );
    expect(update.status).toBe(200);
    expect(database.contacts.get(created.contact.id)).toMatchObject({
      enabled: false,
      displayOrder: 3,
    });

    const remove = await handler(
      new Request('https://unirise.example/api/admin/line-contacts', {
        method: 'DELETE',
        headers: {
          Origin: 'https://unirise.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: created.contact.id }),
      }),
    );
    expect(remove.status).toBe(200);
    expect(database.contacts.size).toBe(0);
    expect(database.audit.map((entry) => entry.action)).toEqual([
      'line_contact.created',
      'line_contact.updated',
      'line_contact.deleted',
    ]);
  });

  it('拒絕編輯者與跨網站請求', async () => {
    const database = new TestDatabase();
    const editorHandler = createAdminLineContactsHandler(
      database.d1,
      async () => ({
        id: 'editor-1',
        email: 'editor@example.com',
        role: 'editor',
      }),
    );
    expect(
      (
        await editorHandler(
          new Request('https://unirise.example/api/admin/line-contacts'),
        )
      ).status,
    ).toBe(403);
    const handler = createAdminLineContactsHandler(database.d1, admin);
    expect(
      (
        await handler(
          new Request('https://unirise.example/api/admin/line-contacts', {
            method: 'POST',
            headers: {
              Origin: 'https://other.example',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(contact),
          }),
        )
      ).status,
    ).toBe(403);
  });
});
