import handler from 'vinext/server/fetch-handler';
import {
  scheduleAnalyticsRetention,
  type RetentionExecutionContext,
} from './lib/analytics-retention';

const worker = {
  fetch(...args: Parameters<typeof handler.fetch>) {
    return handler.fetch(...args);
  },
  scheduled(
    _controller: unknown,
    runtime: { DB: D1Database },
    context: RetentionExecutionContext,
  ) {
    scheduleAnalyticsRetention(runtime.DB, context);
  },
};

export default worker;
