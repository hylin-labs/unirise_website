import handler from 'vinext/server/fetch-handler';
import {
  scheduleAnalyticsRetention,
  type RetentionExecutionContext,
} from './lib/analytics-retention';
import { ensureInitialContent } from './lib/runtime-initialization';

const worker = {
  async fetch(
    request: Request,
    runtime: { DB: D1Database },
    context: ExecutionContext,
  ) {
    await ensureInitialContent(runtime.DB);
    return handler.fetch(request, runtime, context);
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
