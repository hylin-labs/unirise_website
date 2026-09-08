import { env } from 'cloudflare:workers';
import {
  createChatLead,
  type LeadInput,
  type LeadMailer,
} from '../../../lib/lead-service';
import { sendLeadNotification } from '../../../lib/resend';

type LeadsHandlerOptions = {
  db: D1Database;
  mailer: LeadMailer;
};

function errorResponse(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function createLeadsHandler({ db, mailer }: LeadsHandlerOptions) {
  return async function handleLeads(request: Request) {
    const origin = request.headers.get('origin');
    if (origin !== new URL(request.url).origin)
      return errorResponse('origin_not_allowed', 403);

    let body: Record<string, unknown>;
    try {
      const value = await request.json();
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return errorResponse('invalid_request', 400);
      body = value as Record<string, unknown>;
    } catch {
      return errorResponse('invalid_request', 400);
    }

    const visitorIdentifier =
      request.headers.get('CF-Connecting-IP') ??
      request.headers.get('x-forwarded-for') ??
      'unknown';
    try {
      const result = await createChatLead(
        db,
        body as LeadInput,
        {
          sourcePath:
            typeof body.sourcePath === 'string' ? body.sourcePath : '',
          visitorIdentifier,
        },
        mailer,
      );
      return Response.json(
        { accepted: true, followUpDelayed: !result.emailDelivered },
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_lead')
        return errorResponse('invalid_lead', 400);
      if (error instanceof Error && error.message === 'rate_limited')
        return errorResponse('rate_limited', 429);
      return errorResponse('lead_unavailable', 503);
    }
  };
}

export async function POST(request: Request) {
  const runtime = env as unknown as {
    DB: D1Database;
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
  };
  return createLeadsHandler({
    db: runtime.DB,
    mailer: (notification) =>
      sendLeadNotification(notification, {
        apiKey: runtime.RESEND_API_KEY,
        fromEmail: runtime.RESEND_FROM_EMAIL,
      }),
  })(request);
}
