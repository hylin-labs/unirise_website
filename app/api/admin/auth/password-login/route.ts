import { env } from 'cloudflare:workers';
import {
  createAdminSessionCookie,
  verifyAdminPassword,
} from '../../../../../lib/admin-auth';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: 'origin_not_allowed' }, { status: 403 });
  }
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; password?: unknown };
  } catch {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }
  const runtime = env as unknown as {
    DB: D1Database;
    ADMIN_AUTH_PEPPER?: string;
    ADMIN_PASSWORD_HASH?: string;
  };
  try {
    const verified = await verifyAdminPassword(
      runtime.DB,
      typeof body.email === 'string' ? body.email : '',
      typeof body.password === 'string' ? body.password : '',
      runtime.ADMIN_PASSWORD_HASH ?? '',
      runtime.ADMIN_AUTH_PEPPER ?? '',
    );
    if (!verified)
      return Response.json({ error: 'invalid_credentials' }, { status: 401 });
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', createAdminSessionCookie(verified.sessionToken));
    return Response.json({ authenticated: true }, { headers });
  } catch (error) {
    console.error('Admin password login failed', error);
    return Response.json({ error: 'auth_unavailable' }, { status: 503 });
  }
}
