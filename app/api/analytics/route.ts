import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../lib/admin-auth';
import {
  getDashboardSnapshot,
  hashVisitorIdentifier,
  isPublicEventRequestAllowed,
  recordEvent,
  type AnalyticsEventName,
} from '../../../lib/analytics';
import { readCookie } from '../../../lib/visitor-stats';

type Authenticate = typeof requireAdmin;
type HandlerOptions = {
  db: D1Database;
  authenticate?: Authenticate;
};

const VISITOR_COOKIE = 'unirise_visitor';
const MAX_PUBLIC_EVENT_BYTES = 2_048;

function jsonError(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function localHostname(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}

function validPublicEvent(value: unknown): {
  name: Extract<AnalyticsEventName, 'page_view' | 'download_click'>;
  path: string;
  metadata?: Record<string, unknown>;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (payload.name !== 'page_view' && payload.name !== 'download_click') {
    return null;
  }
  if (
    typeof payload.path !== 'string' ||
    !payload.path.startsWith('/') ||
    payload.path.startsWith('//') ||
    payload.path.length > 500
  ) {
    return null;
  }
  return {
    name: payload.name,
    path: payload.path,
    metadata:
      payload.metadata &&
      typeof payload.metadata === 'object' &&
      !Array.isArray(payload.metadata)
        ? (payload.metadata as Record<string, unknown>)
        : undefined,
  };
}

export function createAnalyticsHandler({
  db,
  authenticate = requireAdmin,
}: HandlerOptions) {
  return async function handleAnalytics(request: Request) {
    const url = new URL(request.url);
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      if (!origin || origin !== url.origin) {
        return jsonError('origin_not_allowed', 403);
      }
      const declaredSize = Number(request.headers.get('content-length') ?? 0);
      if (
        Number.isFinite(declaredSize) &&
        declaredSize > MAX_PUBLIC_EVENT_BYTES
      ) {
        return jsonError('request_too_large', 413);
      }
      let body: unknown;
      try {
        const rawBody = await request.text();
        if (
          new TextEncoder().encode(rawBody).byteLength > MAX_PUBLIC_EVENT_BYTES
        ) {
          return jsonError('request_too_large', 413);
        }
        body = JSON.parse(rawBody) as unknown;
      } catch {
        return jsonError('invalid_request', 400);
      }
      const event = validPublicEvent(body);
      if (!event) return jsonError('invalid_event', 400);
      if (
        localHostname(url.hostname) ||
        event.path === '/admin' ||
        event.path.startsWith('/admin/')
      ) {
        return Response.json(
          { accepted: false },
          { status: 202, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      const visitorId = readCookie(
        request.headers.get('cookie'),
        VISITOR_COOKIE,
      );
      if (!visitorId) {
        return Response.json(
          { accepted: false },
          { status: 202, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      try {
        const visitorHash = await hashVisitorIdentifier(visitorId);
        if (!(await isPublicEventRequestAllowed(db, visitorHash))) {
          return jsonError('rate_limited', 429);
        }
        await recordEvent(db, {
          visitorHash,
          ...event,
        });
      } catch {
        return jsonError('analytics_unavailable', 503);
      }
      return Response.json(
        { accepted: true },
        { status: 202, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (request.method !== 'GET') return jsonError('method_not_allowed', 405);
    let actor;
    try {
      actor = await authenticate(request, db);
    } catch {
      return jsonError('analytics_unavailable', 503);
    }
    if (!actor) return jsonError('unauthorized', 401);
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    try {
      const snapshot = await getDashboardSnapshot(db, { from, to });
      return Response.json(snapshot, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_date_range') {
        return jsonError('invalid_date_range', 400);
      }
      return jsonError('analytics_unavailable', 503);
    }
  };
}

function handler(request: Request) {
  return createAnalyticsHandler({
    db: (env as unknown as { DB: D1Database }).DB,
  })(request);
}

export const GET = handler;
export const POST = handler;
