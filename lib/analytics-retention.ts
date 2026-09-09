import { cleanupExpiredRateLimits } from './chat-rate-limit';

export type RetentionExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export function scheduleAnalyticsRetention(
  db: D1Database,
  context: RetentionExecutionContext,
  now = new Date(),
) {
  context.waitUntil(cleanupExpiredRateLimits(db, now));
}
