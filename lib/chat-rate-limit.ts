import { visitorStatsSchema } from '../db/schema';

const LIMIT_PER_MINUTE = 6;

function minuteBucket(now = new Date()) {
  return now.toISOString().slice(0, 16);
}

async function hashValue(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function isChatRequestAllowed(db: D1Database, visitorId: string) {
  const bucket = minuteBucket();
  const previousHour = minuteBucket(new Date(Date.now() - 60 * 60 * 1000));
  const visitorHash = await hashValue(visitorId);

  await db.prepare(`DELETE FROM ${visitorStatsSchema.chatRateLimits} WHERE bucket < ?`).bind(previousHour).run();
  const result = await db.prepare<{ request_count: number }>(`
    INSERT INTO ${visitorStatsSchema.chatRateLimits} (bucket, visitor_hash, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(bucket, visitor_hash) DO UPDATE SET request_count = request_count + 1
    RETURNING request_count
  `).bind(bucket, visitorHash).first();

  return (result?.request_count ?? LIMIT_PER_MINUTE + 1) <= LIMIT_PER_MINUTE;
}
