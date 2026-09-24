import type { AdminIdentity } from './admin-auth';
import { uniriseSchema } from '../db/schema';

const MAX_LABEL_LENGTH = 80;
const MAX_URL_LENGTH = 2_048;
const ALLOWED_LINE_HOSTS = new Set([
  'line.me',
  'www.line.me',
  'lin.ee',
  'www.lin.ee',
]);

export type LineContact = {
  id: string;
  labelZh: string;
  labelEn: string;
  lineUrl: string;
  enabled: boolean;
  displayOrder: number;
  updatedAt: string;
};

export type LineContactInput = Omit<LineContact, 'id' | 'updatedAt'>;

export class LineContactValidationError extends Error {}

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

const defaultContact: LineContact = {
  id: 'hungyu-test',
  labelZh: 'Hungyu（測試聯絡）',
  labelEn: 'Hungyu (test contact)',
  lineUrl: 'https://line.me/ti/p/Rg3ax2MQJn',
  enabled: true,
  displayOrder: 0,
  updatedAt: '',
};

function requiredLabel(value: unknown, field: string) {
  if (typeof value !== 'string')
    throw new LineContactValidationError(`${field} is required`);
  const normalized = value.normalize('NFKC').trim();
  if (
    !normalized ||
    normalized.length > MAX_LABEL_LENGTH ||
    hasControlCharacter(normalized)
  ) {
    throw new LineContactValidationError(`${field} is invalid`);
  }
  return normalized;
}

export function normalizeLineUrl(value: unknown) {
  if (typeof value !== 'string')
    throw new LineContactValidationError('lineUrl is required');
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > MAX_URL_LENGTH ||
    hasControlCharacter(normalized) ||
    normalized.includes('\\')
  )
    throw new LineContactValidationError('lineUrl is invalid');

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new LineContactValidationError('lineUrl is invalid');
  }
  if (
    url.protocol !== 'https:' ||
    !ALLOWED_LINE_HOSTS.has(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.pathname === '/'
  ) {
    throw new LineContactValidationError('lineUrl must be a LINE link');
  }
  return url.toString();
}

function displayOrder(value: unknown) {
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 999
  )
    throw new LineContactValidationError('displayOrder is invalid');
  return value as number;
}

export function parseLineContactInput(value: unknown): LineContactInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new LineContactValidationError('invalid_request');
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set([
    'labelZh',
    'labelEn',
    'lineUrl',
    'enabled',
    'displayOrder',
  ]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key)))
    throw new LineContactValidationError('invalid_request');
  if (typeof record.enabled !== 'boolean')
    throw new LineContactValidationError('enabled is invalid');
  return {
    labelZh: requiredLabel(record.labelZh, 'labelZh'),
    labelEn: requiredLabel(record.labelEn, 'labelEn'),
    lineUrl: normalizeLineUrl(record.lineUrl),
    enabled: record.enabled,
    displayOrder: displayOrder(record.displayOrder),
  };
}

type Row = {
  id: string;
  label_zh: string;
  label_en: string;
  line_url: string;
  enabled: number;
  display_order: number;
  updated_at: string;
};

function contactFromRow(row: Row): LineContact {
  return {
    id: row.id,
    labelZh: row.label_zh,
    labelEn: row.label_en,
    lineUrl: row.line_url,
    enabled: row.enabled === 1,
    displayOrder: row.display_order,
    updatedAt: row.updated_at,
  };
}

export async function listLineContacts(
  db: D1Database,
  includeDisabled = false,
) {
  const condition = includeDisabled ? '' : 'WHERE enabled = 1';
  const result = await db
    .prepare(
      `SELECT id, label_zh, label_en, line_url, enabled, display_order, updated_at
       FROM ${uniriseSchema.lineContacts} ${condition}
       ORDER BY display_order ASC, updated_at DESC, id ASC`,
    )
    .all<Row>();
  return result.results.map(contactFromRow);
}

export async function createLineContact(
  db: D1Database,
  input: LineContactInput,
  actor: AdminIdentity,
) {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO ${uniriseSchema.lineContacts}
         (id, label_zh, label_en, line_url, enabled, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.labelZh,
        input.labelEn,
        input.lineUrl,
        input.enabled ? 1 : 0,
        input.displayOrder,
        timestamp,
        timestamp,
      ),
    auditStatement(db, actor, 'line_contact.created', id, input, timestamp),
  ]);
  return { id, ...input, updatedAt: timestamp };
}

export async function updateLineContact(
  db: D1Database,
  id: string,
  input: LineContactInput,
  actor: AdminIdentity,
) {
  const timestamp = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE ${uniriseSchema.lineContacts}
       SET label_zh = ?, label_en = ?, line_url = ?, enabled = ?, display_order = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      input.labelZh,
      input.labelEn,
      input.lineUrl,
      input.enabled ? 1 : 0,
      input.displayOrder,
      timestamp,
      id,
    )
    .run();
  if (result.meta.changes !== 1) return null;
  await db.batch([
    auditStatement(db, actor, 'line_contact.updated', id, input, timestamp),
  ]);
  return { id, ...input, updatedAt: timestamp };
}

export async function deleteLineContact(
  db: D1Database,
  id: string,
  actor: AdminIdentity,
) {
  const result = await db
    .prepare(`DELETE FROM ${uniriseSchema.lineContacts} WHERE id = ?`)
    .bind(id)
    .run();
  if (result.meta.changes !== 1) return false;
  const timestamp = new Date().toISOString();
  await db.batch([
    auditStatement(db, actor, 'line_contact.deleted', id, {}, timestamp),
  ]);
  return true;
}

function auditStatement(
  db: D1Database,
  actor: AdminIdentity,
  action: string,
  id: string,
  detail: Record<string, unknown>,
  timestamp: string,
) {
  return db
    .prepare(
      `INSERT INTO ${uniriseSchema.adminAuditLog}
       (id, admin_user_id, action, target_type, target_id, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actor.id,
      action,
      'line_contact',
      id,
      JSON.stringify(detail),
      timestamp,
    );
}

export function publicLineContacts(contacts: LineContact[]) {
  return contacts.map(({ id, labelZh, labelEn, lineUrl, displayOrder }) => ({
    id,
    labelZh,
    labelEn,
    lineUrl,
    displayOrder,
  }));
}

export const fallbackLineContacts = [defaultContact];
