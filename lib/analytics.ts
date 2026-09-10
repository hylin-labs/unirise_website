import { uniriseSchema, visitorStatsSchema } from '../db/schema';
import {
  LOCALES,
  parseLocale,
  parseLocaleOrDefault,
  type Locale,
} from './locales';

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

const CHAT_QUESTION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export type DashboardSnapshot = {
  metrics: DashboardMetrics;
  byLocale: Record<
    Locale,
    {
      metrics: DashboardMetrics;
      topPages: Array<{ path: string; count: number }>;
      topDownloads: Array<{ path: string; count: number }>;
    }
  >;
  translations: {
    needsReview: number;
    published: number;
    draft: number;
    outdated: number;
  };
  unansweredQuestions: Array<{
    locale: Locale;
    id: string;
    question: string;
    sourceIds: string[];
    createdAt: string;
  }>;
  topPages: Array<{ path: string; count: number }>;
  topDownloads: Array<{ path: string; count: number }>;
  leads: Array<{
    locale: Locale;
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
      lead: string;
      imageUrl: string;
      highlights: string[];
      videoUrl: string | null;
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
      content: string;
      tags: string[];
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
const ENGLISH_ADDRESS_PATTERN = String.raw`(?:\bP\.?\s*O\.?\s+Box\s+\d+\b|\b\d{1,6}\s+(?:[A-Z0-9.'-]+\s+){0,8}(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Highway|Hwy)\b)`;
const CHINESE_ADDRESS_PATTERN = String.raw`(?:地址|住址|住在|居住|寄送到|寄到)?[\u4e00-\u9fff]{0,24}(?:路|街|段|巷|弄)\s*\d{1,6}\s*(?:之\s*\d{1,4}\s*)?號`;

function asNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseDate(value: string) {
  if (!DATE_PATTERN.test(value)) return null;
  const validationDate = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(validationDate.getTime()) ||
    validationDate.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

export function dashboardBounds(range: DashboardRange) {
  const from = parseDate(range.from);
  const to = parseDate(range.to);
  if (!from || !to || from > to) throw new Error('invalid_date_range');
  const fromBoundary = new Date(`${from}T00:00:00.000+08:00`);
  const exclusiveTo = new Date(`${to}T00:00:00.000+08:00`);
  exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);
  if (
    exclusiveTo.getTime() - fromBoundary.getTime() >
    367 * 24 * 60 * 60 * 1000
  ) {
    throw new Error('invalid_date_range');
  }
  return { from: fromBoundary.toISOString(), to: exclusiveTo.toISOString() };
}

export async function hashVisitorIdentifier(
  value: string,
  pepper: string,
  context:
    | 'analytics-visitor'
    | 'analytics-throttle'
    | 'chat-visitor'
    | 'chat-throttle'
    | 'lead-visitor'
    | 'lead-throttle',
) {
  if (pepper.length < 32) throw new Error('analytics_not_configured');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`unirise-analytics-v1:${context}:${value}`),
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
    locale: Locale;
    visitorHash: string | null;
    name: AnalyticsEventName;
    path: string;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  },
) {
  if (!EVENT_NAMES.has(event.name)) throw new Error('invalid_event');
  const locale = parseLocale(event.locale);
  if (!locale) throw new Error('invalid_event');
  const visitorHash = event.visitorHash?.trim() || null;
  const occurredAt = (event.occurredAt ?? new Date()).toISOString();
  await db
    .prepare(
      `INSERT INTO ${uniriseSchema.siteEvents}
        (id, visitor_hash, name, path, metadata_json, occurred_at, locale)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      visitorHash,
      event.name,
      safePath(event.path),
      JSON.stringify(safeMetadata(event.name, event.metadata)),
      occurredAt,
      locale,
    )
    .run();
}

export function sanitizeQuestion(value: string) {
  const withoutControls = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
  return withoutControls
    .replace(/\b[A-Z][12]\d{8}\b/gi, '[身分資料已隱藏]')
    .replace(/(?:\d[ -]*?){13,19}/g, '[付款資料已隱藏]')
    .replace(
      /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      '[電子信箱已隱藏]',
    )
    .replace(/(?:\+?\d[\d\s().-]{5,}\d)/g, '[電話已隱藏]')
    .replace(
      /(?:密碼|密码|password|passcode|api[ _-]?key|access[ _-]?token|secret)\s*(?:是|為|:|：|=)?\s*[^，。,.!?！？\s]{1,120}/gi,
      '[機密資訊已隱藏]',
    )
    .replace(
      /(?:地址|住址)?[\u4e00-\u9fff]{2,10}[市縣][\u4e00-\u9fff0-9\-之弄巷路街段區鄉鎮村里]{2,80}號/gu,
      '[地址已隱藏]',
    )
    .replace(new RegExp(ENGLISH_ADDRESS_PATTERN, 'gi'), '[地址已隱藏]')
    .replace(new RegExp(CHINESE_ADDRESS_PATTERN, 'gu'), '[地址已隱藏]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
    .trim();
}

function containsHighlySensitiveText(value: string) {
  return (
    /(?:密碼|密码|password|passcode|api[ _-]?key|access[ _-]?token|secret)\s*(?:是|為|:|：|=)?\s*\S+/i.test(
      value,
    ) ||
    /\b[A-Z][12]\d{8}\b/i.test(value) ||
    /(?:\d[ -]*?){13,19}/.test(value) ||
    /(?:地址|住址)?[\u4e00-\u9fff]{2,10}[市縣][\u4e00-\u9fff0-9\-之弄巷路街段區鄉鎮村里]{2,80}號/u.test(
      value,
    ) ||
    new RegExp(ENGLISH_ADDRESS_PATTERN, 'i').test(value) ||
    new RegExp(CHINESE_ADDRESS_PATTERN, 'u').test(value)
  );
}

function safeSourceIds(sourceIds: string[]) {
  return [...new Set(sourceIds)]
    .filter((id) => /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(id))
    .slice(0, 10);
}

export async function recordChatOutcome(
  db: D1Database,
  input: {
    locale: Locale;
    question: string;
    outcome: 'answered' | 'unanswered';
    sourceIds: string[];
    createdAt?: Date;
  },
) {
  const now = input.createdAt ?? new Date();
  const locale = parseLocale(input.locale);
  if (!locale) throw new Error('invalid_locale');
  if (containsHighlySensitiveText(input.question)) return;
  const question = sanitizeQuestion(input.question);
  if (!question) return;
  await db
    .prepare(
      `INSERT INTO ${uniriseSchema.chatQuestions}
          (id, question, outcome, source_ids_json, created_at, locale)
         VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      question,
      input.outcome,
      JSON.stringify(safeSourceIds(input.sourceIds)),
      now.toISOString(),
      locale,
    )
    .run();
}

export async function pruneExpiredChatQuestions(
  db: D1Database,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - CHAT_QUESTION_RETENTION_MS);
  await db
    .prepare(`DELETE FROM ${uniriseSchema.chatQuestions} WHERE created_at < ?`)
    .bind(cutoff.toISOString())
    .run();
}

export async function getDashboardMetrics(
  db: D1Database,
  range: DashboardRange,
  locale?: Locale,
): Promise<DashboardMetrics> {
  if (locale !== undefined && !parseLocale(locale))
    throw new Error('invalid_locale');
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
       WHERE occurred_at >= ? AND occurred_at < ?${locale ? ' AND locale = ?' : ''}`,
    )
    .bind(bounds.from, bounds.to, ...(locale ? [locale] : []))
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

function parseTextList(value: unknown) {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

async function localeRanking(
  db: D1Database,
  bounds: DashboardRange,
  locale: Locale,
  name: 'page_view' | 'download_click',
) {
  const rows = await db
    .prepare(
      `SELECT path, COUNT(*) AS count FROM ${uniriseSchema.siteEvents}
     WHERE occurred_at >= ? AND occurred_at < ? AND name = ? AND locale = ?
     GROUP BY path ORDER BY count DESC LIMIT 20`,
    )
    .bind(bounds.from, bounds.to, name, locale)
    .all<{ path: string; count: number }>();
  return rows.results.map((row) => ({
    path: row.path,
    count: asNumber(row.count),
  }));
}

export async function getDashboardSnapshot(
  db: D1Database,
  range: DashboardRange,
): Promise<DashboardSnapshot> {
  const bounds = dashboardBounds(range);
  const questionCutoff = new Date(
    Date.now() - CHAT_QUESTION_RETENTION_MS,
  ).toISOString();
  const [
    metrics,
    gaps,
    topPages,
    topDownloads,
    leads,
    news,
    downloads,
    knowledge,
    translations,
    localeSnapshots,
  ] = await Promise.all([
    getDashboardMetrics(db, range),
    db
      .prepare(
        `SELECT id, question, outcome, source_ids_json, created_at, locale
           FROM ${uniriseSchema.chatQuestions}
           WHERE created_at >= ? AND created_at < ? AND outcome = 'unanswered'
           ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(
        bounds.from > questionCutoff ? bounds.from : questionCutoff,
        bounds.to,
      )
      .all<{
        id: string;
        question: string;
        source_ids_json: string;
        created_at: string;
        locale: Locale;
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
                  source_path, status, email_delivered, created_at, locale
           FROM ${uniriseSchema.chatLeads}
           WHERE created_at >= ? AND created_at < ?
           ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(bounds.from, bounds.to)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT id, legacy_id, title, lead, image_url, highlights_json, video_url, status, updated_at
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
        `SELECT id, title, href, body, tags_json, status, updated_at
           FROM ${uniriseSchema.chatKnowledge} ORDER BY updated_at DESC`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(`SELECT
      SUM(CASE WHEN status = 'needs_review' THEN 1 ELSE 0 END) AS needs_review,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
      SUM(outdated) AS outdated
      FROM ${uniriseSchema.contentTranslations} WHERE locale = 'en'`)
      .first<{
        needs_review: number;
        published: number;
        draft: number;
        outdated: number;
      }>(),
    Promise.all(
      LOCALES.map(async (locale) => {
        const [metrics, topPages, topDownloads] = await Promise.all([
          getDashboardMetrics(db, range, locale),
          localeRanking(db, bounds, locale, 'page_view'),
          localeRanking(db, bounds, locale, 'download_click'),
        ]);
        return [locale, { metrics, topPages, topDownloads }] as const;
      }),
    ),
  ]);

  return {
    metrics,
    byLocale: Object.fromEntries(
      localeSnapshots,
    ) as DashboardSnapshot['byLocale'],
    translations: {
      needsReview: asNumber(translations?.needs_review),
      published: asNumber(translations?.published),
      draft: asNumber(translations?.draft),
      outdated: asNumber(translations?.outdated),
    },
    unansweredQuestions: gaps.results.map((row) => ({
      locale: parseLocaleOrDefault(row.locale),
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
      locale: parseLocaleOrDefault(row.locale),
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
        lead: String(row.lead),
        imageUrl: String(row.image_url),
        highlights: parseTextList(row.highlights_json),
        videoUrl: optionalString(row.video_url),
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
        content: String(row.body),
        tags: parseTextList(row.tags_json),
        status: String(row.status),
        updatedAt: String(row.updated_at),
      })),
    },
  };
}
