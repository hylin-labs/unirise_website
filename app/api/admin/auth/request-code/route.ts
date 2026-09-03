import { env } from 'cloudflare:workers';
import { getRequestExecutionContext } from 'vinext/shims/request-context';
import { requestAdminCode } from '../../../../../lib/admin-auth';
import { sendLoginCode } from '../../../../../lib/resend';

type AuthRuntime = {
  DB: D1Database;
  ADMIN_AUTH_PEPPER?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

type RequestCodeDependencies = {
  db: D1Database;
  codePepper: string | undefined;
  mailer: Parameters<typeof requestAdminCode>[3];
  waitUntil: (promise: Promise<unknown>) => void;
  onError?: (message: string, error: unknown) => void;
};

function accepted() {
  return Response.json(
    { accepted: true },
    { status: 202, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function createRequestCodeHandler({
  db,
  codePepper,
  mailer,
  waitUntil,
  onError = console.error,
}: RequestCodeDependencies) {
  return async function handleRequestCode(request: Request) {
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

    const visitorIdentifier =
      request.headers.get('CF-Connecting-IP') ??
      request.headers.get('x-forwarded-for') ??
      'unknown';
    const backgroundRequest = requestAdminCode(
      db,
      email,
      visitorIdentifier,
      mailer,
      codePepper ?? '',
    ).catch((error) => onError('Admin login code request failed', error));
    waitUntil(backgroundRequest);
    return accepted();
  };
}

export async function POST(request: Request) {
  const runtime = env as unknown as AuthRuntime;
  const executionContext = getRequestExecutionContext();
  return createRequestCodeHandler({
    db: runtime.DB,
    codePepper: runtime.ADMIN_AUTH_PEPPER,
    mailer: (message) =>
      sendLoginCode(message, {
        apiKey: runtime.RESEND_API_KEY,
        fromEmail: runtime.RESEND_FROM_EMAIL,
      }),
    waitUntil: (promise) => {
      if (executionContext) executionContext.waitUntil(promise);
      else void promise;
    },
  })(request);
}
