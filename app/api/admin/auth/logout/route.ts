import { env } from 'cloudflare:workers';
import {
  clearAdminSessionCookie,
  destroyAdminSession,
} from '../../../../../lib/admin-auth';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json(
      { error: 'origin_not_allowed' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  await destroyAdminSession(request, (env as unknown as { DB: D1Database }).DB);
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', clearAdminSessionCookie());
  return Response.json({ authenticated: false }, { headers });
}
