import { uniriseSchema, visitorStatsSchema } from '../db/schema';

export type AnalyticsEventName =
  | 'page_view'
  | 'download_click'
  | 'chat_question'
  | 'chat_answered'
  | 'chat_unanswered'
  | 'inquiry_submitted';

export type DashboardMetrics = {
  uniqueVisitors: number;
  pageViews: number;
  downloadClicks: number;
  chatQuestions: number;
  chatAnswerRate: number;
  unansweredQuestions: number;
  leads: number;
  leadConversionRate: number;
};

export type DashboardRange = { from: string; to: string };

export type DashboardSnapshot = {
  metrics: DashboardMetrics;
  unansweredQuestions: Array<{
    id: string;
    question: string;
    sourceIds: string[];
    createdAt: string;
  }>;
  topPages: Array<{ path: string; count: number }>;
  topDownloads: Array<{ path: string; count: number }>;
  leads: Array<{
    id: string;
    requestType: string;
    name: string;
    email: string;
    company: string | null;
    phone: string | null;
    topic: string | null;
    message: string;
    sourcePath: string;
    status: string;
    emailDelivered: boolean;
    createdAt: string;
  }>;
  content: {
    news: Array<{
      id: string;
      legacyId: string;
      title: string;
      status: string;
      updatedAt: string;
    }>;
    downloads: Array<{
      id: string;
      legacyId: string;
      title: string;
      status: string;
      updatedAt: string;
    }>;
    knowledge: Array<{
      id: string;
      title: string;
      href: string;
      status: string;
      updatedAt: string;
    }>;
  };
};

type MetricRow = {
  unique_visitors: number | string | null;
  page_views: number | string | null;
  download_clicks: number | string | null;
  chat_questions: number | string | null;
  chat_answered: number | string | null;
  unanswered_questions: number | string | null;
  leads: number | string | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_NAMES = new Set<AnalyticsEventName>([
  'page_view',
  'download_click',
  'chat_question',
  'chat_answered',
  'chat_unanswered',
  'inquiry_submitted',
]);
const PUBLIC_EVENT_LIMIT_PER_MINUTE = 60;

function asNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseDate(value: string) {
  if (!DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

export function dashboardBounds(range: DashboardRange) {
  const from = parseDate(range.from);
  const to = parseDate(range.to);
  if (!from || !to || from > to) throw new Error('invalid_date_range');
  const exclusiveTo = new Date(to);
  exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);
  if (exclusiveTo.getTime() - from.getTime() > 367 * 24 * 60 * 60 * 1000) {
    throw new Error('invalid_date_range');
  }
  return { from: from.toISOString(), to: exclusiveTo.toISOString() };
}

export async function hashVisitorIdentifier(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function isPublicEventRequestAllowed(
  db: D1Database,
  visitorHash: string,
  now = new Date(),
) {
  const bucket = `analytics:${now.toISOString().slice(0, 16)}`;
  const cleanupBefore = `analytics:${new Date(now.getTime() - 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16)}`;
  await db
    .prepare(
      `DELETE FROM ${visitorStatsSchema.chatRateLimits}
       WHERE bucket LIKE 'analytics:%' AND bucket < ?`,
    )
    .bind(cleanupBefore)
    .run();
  const reservation = await db
    .prepare(
      `INSERT INTO ${visitorStatsSchema.chatRateLimits}
        (bucket, visitor_hash, request_count)
       VALUES (?, ?, 1)
       ON CONFLICT(bucket, visitor_hash)
       DO UPDATE SET request_count = request_count + 1
       RETURNING request_count`,
    )
    .bind(bucket, visitorHash)
    .first<{ request_count: number }>();
  return (
    reservation !== null &&
    reservation.request_count <= PUBLIC_EVENT_LIMIT_PER_MINUTE
  );
}

function safePath(value: string) {
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.length > 500) {
    throw new Error('invalid_event');
  }
  return path;
}

function safeMetadata(
  name: AnalyticsEventName,
  metadata: Record<string, unknown> | undefined,
) {
  if (!metadata) return {};
  if (name === 'download_click') {
    const downloadId = metadata.downloadId;
    if (
      typeof downloadId === 'string' &&
      /^[a-z0-9._:-]{1,160}$/i.test(downloadId)
    ) {
      return { downloadId };
    }
  }
  if (name === 'inquiry_submitted') {
    const requestType = metadata.requestType;
    if (requestType === 'quote' || requestType === 'specialist') {
      return { requestType };
    }
  }
  return {};
}

export async function recordEvent(
  db: D1Database,
  event: {
    visitorHash: string | null;
    name: AnalyticsEventName;
    path: string;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  },
) {
  if (!EVENT_NAMES.has(event.name)) throw new Error('invalid_event');
  const visitorHash = event.visitorHash?.trim() || null;
  const occurredAt = (event.occurredAt ?? new Date()).toISOString();
  await db
    .prepare(
      `INSERT INTO ${uniriseSchema.siteEvents}
        (id, visitor_hash, name, path, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      visitorHash,
      event.name,
      safePath(event.path),
      JSON.stringify(safeMetadata(event.name, event.metadata)),
      occurredAt,
    )
    .run();
}

export function sanitizeQuestion(value: string) {
  const withoutControls = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
  return withoutControls
    .replace(
      /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      '[電子信箱已隱藏]',
    )
    .replace(/(?:\+?\d[\d\s().-]{5,}\d)/g, '[電話已隱藏]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
    .trim();
}

function safeSourceIds(sourceIds: string[]) {
  return [...new Set(sourceIds)]
    .filter((id) => /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(id))
    .slice(0, 10);
}

export async function recordChatOutcome(
  db: D1Database,
  input: {
    question: string;
    outcome: 'answered' | 'unanswered';
    sourceIds: string[];
    createdAt?: Date;
  },
) {
  const now = input.createdAt ?? new Date();
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const question = sanitizeQuestion(input.question);
  if (!question) return;
  await db.batch([
    db
      .prepare(
        `DELETE FROM ${uniriseSchema.chatQuestions} WHERE created_at < ?`,
      )
      .bind(cutoff.toISOString()),
    db
      .prepare(
        `INSERT INTO ${uniriseSchema.chatQuestions}
          (id, question, outcome, source_ids_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        question,
        input.outcome,
        JSON.stringify(safeSourceIds(input.sourceIds)),
        now.toISOString(),
      ),
  ]);
}

export async function getDashboardMetrics(
  db: D1Database,
  range: DashboardRange,
): Promise<DashboardMetrics> {
  const bounds = dashboardBounds(range);
  const row = await db
    .prepare(
      `SELECT
         COUNT(DISTINCT CASE WHEN name = 'page_view' THEN visitor_hash END) AS unique_visitors,
         SUM(CASE WHEN name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
         SUM(CASE WHEN name = 'download_click' THEN 1 ELSE 0 END) AS download_clicks,
         SUM(CASE WHEN name = 'chat_question' THEN 1 ELSE 0 END) AS chat_questions,
         SUM(CASE WHEN name = 'chat_answered' THEN 1 ELSE 0 END) AS chat_answered,
         SUM(CASE WHEN name = 'chat_unanswered' THEN 1 ELSE 0 END) AS unanswered_questions,
         SUM(CASE WHEN name = 'inquiry_submitted' THEN 1 ELSE 0 END) AS leads
       FROM ${uniriseSchema.siteEvents}
       WHERE occurred_at >= ? AND occurred_at < ?`,
    )
    .bind(bounds.from, bounds.to)
    .first<MetricRow>();
  const uniqueVisitors = asNumber(row?.unique_visitors);
  const chatQuestions = asNumber(row?.chat_questions);
  const chatAnswered = asNumber(row?.chat_answered);
  const leads = asNumber(row?.leads);
  return {
    uniqueVisitors,
    pageViews: asNumber(row?.page_views),
    downloadClicks: asNumber(row?.download_clicks),
    chatQuestions,
    chatAnswerRate: chatQuestions === 0 ? 0 : chatAnswered / chatQuestions,
    unansweredQuestions: asNumber(row?.unanswered_questions),
    leads,
    leadConversionRate: uniqueVisitors === 0 ? 0 : leads / uniqueVisitors,
  };
}

function parseSourceIds(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? safeSourceIds(
          parsed.filter((item): item is string => typeof item === 'string'),
        )
      : [];
  } catch {
    return [];
  }
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

export async function getDashboardSnapshot(
  db: D1Database,
  range: DashboardRange,
): Promise<DashboardSnapshot> {
  const bounds = dashboardBounds(range);
  const [
    metrics,
    gaps,
    topPages,
    topDownloads,
    leads,
    news,
    downloads,
    knowledge,
  ] = await Promise.all([
    getDashboardMetrics(db, range),
    db
      .prepare(
        `SELECT id, question, outcome, source_ids_json, created_at
           FROM ${uniriseSchema.chatQuestions}
           WHERE created_at >= ? AND created_at < ? AND outcome = 'unanswered'
           ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(bounds.from, bounds.to)
      .all<{
        id: string;
        question: string;
        source_ids_json: string;
        created_at: string;
      }>(),
    db
      .prepare(
        `SELECT path, COUNT(*) AS count FROM ${uniriseSchema.siteEvents}
           WHERE occurred_at >= ? AND occurred_at < ? AND name = ?
           GROUP BY path ORDER BY count DESC LIMIT 20`,
      )
      .bind(bounds.from, bounds.to, 'page_view')
      .all<{ path: string; count: number }>(),
    db
      .prepare(
        `SELECT path, COUNT(*) AS count FROM ${uniriseSchema.siteEvents}
           WHERE occurred_at >= ? AND occurred_at < ? AND name = ?
           GROUP BY path ORDER BY count DESC LIMIT 20`,
      )
      .bind(bounds.from, bounds.to, 'download_click')
      .all<{ path: string; count: number }>(),
    db
      .prepare(
        `SELECT id, request_type, name, email, company, phone, topic, message,
                  source_path, status, email_delivered, created_at
           FROM ${uniriseSchema.chatLeads}
           WHERE created_at >= ? AND created_at < ?
           ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(bounds.from, bounds.to)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT id, legacy_id, title, status, updated_at
           FROM ${uniriseSchema.managedNews} ORDER BY updated_at DESC`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT id, legacy_id, title, status, updated_at
           FROM ${uniriseSchema.managedDownloads} ORDER BY updated_at DESC`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT id, title, href, status, updated_at
           FROM ${uniriseSchema.chatKnowledge} ORDER BY updated_at DESC`,
      )
      .all<Record<string, unknown>>(),
  ]);

  return {
    metrics,
    unansweredQuestions: gaps.results.map((row) => ({
      id: row.id,
      question: sanitizeQuestion(row.question),
      sourceIds: parseSourceIds(row.source_ids_json),
      createdAt: row.created_at,
    })),
    topPages: topPages.results.map((row) => ({
      path: row.path,
      count: asNumber(row.count),
    })),
    topDownloads: topDownloads.results.map((row) => ({
      path: row.path,
      count: asNumber(row.count),
    })),
    leads: leads.results.map((row) => ({
      id: String(row.id),
      requestType: String(row.request_type),
      name: String(row.name),
      email: String(row.email),
      company: optionalString(row.company),
      phone: optionalString(row.phone),
      topic: optionalString(row.topic),
      message: String(row.message),
      sourcePath: String(row.source_path),
      status: String(row.status),
      emailDelivered: Number(row.email_delivered) === 1,
      createdAt: String(row.created_at),
    })),
    content: {
      news: news.results.map((row) => ({
        id: String(row.id),
        legacyId: String(row.legacy_id),
        title: String(row.title),
        status: String(row.status),
        updatedAt: String(row.updated_at),
      })),
      downloads: downloads.results.map((row) => ({
        id: String(row.id),
        legacyId: String(row.legacy_id),
        title: String(row.title),
        status: String(row.status),
        updatedAt: String(row.updated_at),
      })),
      knowledge: knowledge.results.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        href: String(row.href),
        status: String(row.status),
        updatedAt: String(row.updated_at),
      })),
    },
  };
}
