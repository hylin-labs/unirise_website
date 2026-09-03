import { env } from 'cloudflare:workers';
import { requestAdminCode } from '../../../../../lib/admin-auth';
import { sendLoginCode } from '../../../../../lib/resend';

type AuthRuntime = {
  DB: D1Database;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

function accepted() {
  return Response.json(
    { accepted: true },
    { status: 202, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json(
      { error: 'origin_not_allowed' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let email = '';
  try {
    const body = (await request.json()) as { email?: unknown };
    if (typeof body.email === 'string' && body.email.length <= 320)
      email = body.email;
  } catch {
    return accepted();
  }

  const runtime = env as unknown as AuthRuntime;
  const visitorIdentifier =
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('x-forwarded-for') ??
    'unknown';
  try {
    await requestAdminCode(runtime.DB, email, visitorIdentifier, (message) =>
      sendLoginCode(message, {
        apiKey: runtime.RESEND_API_KEY,
        fromEmail: runtime.RESEND_FROM_EMAIL,
      }),
    );
  } catch (error) {
    console.error('Admin login code request failed', error);
  }
  return accepted();
}
