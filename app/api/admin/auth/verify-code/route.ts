import { env } from 'cloudflare:workers';
import {
  createAdminSessionCookie,
  verifyAdminCode,
} from '../../../../../lib/admin-auth';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json(
      { error: 'origin_not_allowed' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: { email?: unknown; code?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; code?: unknown };
  } catch {
    return Response.json(
      { error: 'invalid_request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const email =
    typeof body.email === 'string' && body.email.length <= 320
      ? body.email
      : '';
  const code = typeof body.code === 'string' ? body.code : '';
  const verified = await verifyAdminCode(
    (env as unknown as { DB: D1Database }).DB,
    email,
    code,
  );
  if (!verified) {
    return Response.json(
      { error: 'invalid_code' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const headers = new Headers({ 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', createAdminSessionCookie(verified.sessionToken));
  return Response.json(
    {
      authenticated: true,
      user: { id: verified.id, email: verified.email, role: verified.role },
    },
    { headers },
  );
}
