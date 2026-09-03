import { env } from 'cloudflare:workers';
import {
  clearAdminSessionCookie,
  destroyAdminSession,
} from '../../../../../lib/admin-auth';

export function createLogoutHandler(
  db: D1Database,
  onError: (message: string, error: unknown) => void = console.error,
) {
  return async function handleLogout(request: Request) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return Response.json(
        { error: 'origin_not_allowed' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    try {
      await destroyAdminSession(request, db);
    } catch (error) {
      onError('Admin session revocation failed', error);
    }
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', clearAdminSessionCookie());
    return Response.json({ authenticated: false }, { headers });
  };
}

export async function POST(request: Request) {
  return createLogoutHandler((env as unknown as { DB: D1Database }).DB)(
    request,
  );
}
