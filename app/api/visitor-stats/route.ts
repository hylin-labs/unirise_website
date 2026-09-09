import { env } from 'cloudflare:workers';
import { hashVisitorId, readCookie, recordVisitor } from '../../../lib/visitor-stats';

const visitorCookie = 'unirise_visitor';

export async function POST(request: Request) {
  const existingVisitorId = readCookie(request.headers.get('cookie'), visitorCookie);
  const visitorId = existingVisitorId ?? crypto.randomUUID();

  try {
    const runtime = env as unknown as { DB: D1Database };
    const stats = await recordVisitor(runtime.DB, await hashVisitorId(visitorId));
    const headers = new Headers({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    });

    if (!existingVisitorId) {
      const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
      headers.append('Set-Cookie', `${visitorCookie}=${visitorId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
    }

    return new Response(JSON.stringify(stats), { headers });
  } catch {
    return Response.json({ error: 'visitor_stats_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
