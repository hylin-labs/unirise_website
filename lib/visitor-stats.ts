import { visitorStatsSchema, type VisitorStats } from '../db/schema';

function taipeiDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function readCookie(cookieHeader: string | null, name: string) {
  return cookieHeader
    ?.split(';')
    .map((item) => item.trim().split('='))
    .find(([key]) => key === name)
    ?.slice(1)
    .join('=') ?? null;
}

export async function hashVisitorId(visitorId: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(visitorId));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function recordVisitor(db: D1Database, visitorHash: string): Promise<VisitorStats> {
  const day = taipeiDay();
  const [newVisitor] = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO ${visitorStatsSchema.visitors} (visitor_hash, first_seen_at) VALUES (?, ?)`)
      .bind(visitorHash, new Date().toISOString()),
    db.prepare(`INSERT OR IGNORE INTO ${visitorStatsSchema.visitorDays} (day, visitor_hash) VALUES (?, ?)`)
      .bind(day, visitorHash),
  ]);

  if ((newVisitor.meta.changes ?? 0) > 0) {
    await db.prepare(`UPDATE ${visitorStatsSchema.totals} SET value = value + 1 WHERE metric = 'total_visitors'`).run();
  }

  const [totalResult, todayResult] = await db.batch([
    db.prepare<{ value: number }>(`SELECT value FROM ${visitorStatsSchema.totals} WHERE metric = 'total_visitors'`),
    db.prepare<{ count: number }>(`SELECT COUNT(*) AS count FROM ${visitorStatsSchema.visitorDays} WHERE day = ?`).bind(day),
  ]);

  return {
    total: totalResult.results[0]?.value ?? 0,
    today: todayResult.results[0]?.count ?? 0,
  };
}
