import { uniriseSchema } from '../db/schema';

const LEAD_LIMIT_PER_HOUR = 3;
const LEAD_NOTIFICATION_TO = 'hungyu@gmail.com';

export type LeadInput = {
  requestType: 'quote' | 'specialist';
  name: string;
  email: string;
  message: string;
  company?: string;
  phone?: string;
  topic?: string;
};

export type LeadContext = {
  sourcePath: string;
  visitorIdentifier: string;
};

export type LeadNotification = {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
};

export type LeadMailer = (notification: LeadNotification) => Promise<void>;

type NormalizedLead = Required<
  Pick<LeadInput, 'requestType' | 'name' | 'email' | 'message'>
> &
  Pick<LeadInput, 'company' | 'phone' | 'topic'>;

function requiredText(value: unknown, maximumLength: number) {
  if (typeof value !== 'string') throw new Error('invalid_lead');
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength)
    throw new Error('invalid_lead');
  return normalized;
}

function optionalText(value: unknown, maximumLength: number) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('invalid_lead');
  const normalized = value.trim();
  if (normalized.length > maximumLength) throw new Error('invalid_lead');
  return normalized || undefined;
}

function normalizeLead(input: LeadInput): NormalizedLead {
  if (input.requestType !== 'quote' && input.requestType !== 'specialist')
    throw new Error('invalid_lead');
  const email = requiredText(input.email, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('invalid_lead');
  return {
    requestType: input.requestType,
    name: requiredText(input.name, 120),
    email,
    message: requiredText(input.message, 4000),
    company: optionalText(input.company, 160),
    phone: optionalText(input.phone, 50),
    topic: optionalText(input.topic, 200),
  };
}

function normalizeContext(context: LeadContext) {
  const sourcePath = requiredText(context.sourcePath, 500);
  if (!sourcePath.startsWith('/') || sourcePath.startsWith('//'))
    throw new Error('invalid_lead');
  return {
    sourcePath,
    visitorIdentifier: requiredText(context.visitorIdentifier, 500),
  };
}

async function hashVisitorIdentifier(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function notificationFor(lead: NormalizedLead): LeadNotification {
  const requestLabel = lead.requestType === 'quote' ? '索取報價' : '聯絡專員';
  const lines = [
    `需求類型：${requestLabel}`,
    `姓名：${lead.name}`,
    `電子信箱：${lead.email}`,
  ];
  if (lead.company) lines.push(`公司：${lead.company}`);
  if (lead.phone) lines.push(`電話：${lead.phone}`);
  if (lead.topic) lines.push(`產品或主題：${lead.topic}`);
  lines.push('', '需求說明：', lead.message);
  return {
    to: LEAD_NOTIFICATION_TO,
    replyTo: lead.email,
    subject: `合軒科技網站新詢問：${requestLabel}`,
    text: lines.join('\n'),
  };
}

export async function createChatLead(
  db: D1Database,
  input: LeadInput,
  context: LeadContext,
  mailer: LeadMailer,
): Promise<{ id: string; emailDelivered: boolean }> {
  const lead = normalizeLead(input);
  const { sourcePath, visitorIdentifier } = normalizeContext(context);
  const visitorHash = await hashVisitorIdentifier(visitorIdentifier);
  const id = crypto.randomUUID();
  const now = new Date();
  const createdAt = now.toISOString();
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const inserted = await db
    .prepare(
      `INSERT INTO ${uniriseSchema.chatLeads} (
        id, request_type, name, email, company, phone, topic, message,
        source_path, visitor_hash, status, email_delivered, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (
        SELECT COUNT(*) FROM ${uniriseSchema.chatLeads}
        WHERE visitor_hash = ? AND created_at >= ?
      ) < ?`,
    )
    .bind(
      id,
      lead.requestType,
      lead.name,
      lead.email,
      lead.company ?? null,
      lead.phone ?? null,
      lead.topic ?? null,
      lead.message,
      sourcePath,
      visitorHash,
      'new',
      0,
      createdAt,
      createdAt,
      visitorHash,
      cutoff,
      LEAD_LIMIT_PER_HOUR,
    )
    .run();

  if ((inserted.meta.changes ?? 0) === 0) throw new Error('rate_limited');

  await db
    .prepare(
      `INSERT INTO ${uniriseSchema.siteEvents}
        (id, visitor_hash, name, path, metadata_json, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      visitorHash,
      'inquiry_submitted',
      sourcePath,
      JSON.stringify({ requestType: lead.requestType }),
      createdAt,
    )
    .run();

  try {
    await mailer(notificationFor(lead));
    const deliveredAt = new Date().toISOString();
    await db
      .prepare(
        `UPDATE ${uniriseSchema.chatLeads}
        SET email_delivered = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(1, deliveredAt, id)
      .run();
    return { id, emailDelivered: true };
  } catch {
    return { id, emailDelivered: false };
  }
}
