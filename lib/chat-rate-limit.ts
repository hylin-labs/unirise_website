import { visitorStatsSchema } from '../db/schema';
import { hashVisitorIdentifier } from './analytics';

const LIMIT_PER_MINUTE = 6;

function minuteBucket(now = new Date()) {
  return now.toISOString().slice(0, 16);
}

export async function cleanupExpiredRateLimits(
  db: D1Database,
  now = new Date(),
) {
  const cutoff = minuteBucket(new Date(now.getTime() - 60 * 60 * 1000));
  await db
    .prepare(
      `DELETE FROM ${visitorStatsSchema.chatRateLimits}
       WHERE ((bucket NOT LIKE 'lead:%' AND bucket NOT LIKE 'analytics:%') AND bucket < ?)
          OR (bucket LIKE 'lead:%' AND bucket < ?)
          OR (bucket LIKE 'analytics:%' AND bucket < ?)`,
    )
    .bind(cutoff, `lead:${cutoff}`, `analytics:${cutoff}`)
    .run();
}

export async function isChatRequestAllowed(
  db: D1Database,
  visitorId: string,
  hashPepper: string,
  now = new Date(),
) {
  const bucket = minuteBucket(now);
  const visitorHash = await hashVisitorIdentifier(
    visitorId,
    hashPepper,
    'chat-throttle',
  );

  const result = await db
    .prepare(
      `INSERT INTO ${visitorStatsSchema.chatRateLimits} (bucket, visitor_hash, request_count)
       VALUES (?, ?, 1)
       ON CONFLICT(bucket, visitor_hash)
       DO UPDATE SET request_count = request_count + 1
       RETURNING request_count`,
    )
    .bind(bucket, visitorHash)
    .first<{ request_count: number }>();

  return (result?.request_count ?? LIMIT_PER_MINUTE + 1) <= LIMIT_PER_MINUTE;
}
