import { cleanupExpiredRateLimits } from './chat-rate-limit';
import { pruneExpiredChatQuestions } from './analytics';

export type RetentionExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export function scheduleAnalyticsRetention(
  db: D1Database,
  context: RetentionExecutionContext,
  now = new Date(),
) {
  context.waitUntil(
    Promise.all([
      cleanupExpiredRateLimits(db, now),
      pruneExpiredChatQuestions(db, now),
    ]),
  );
}
