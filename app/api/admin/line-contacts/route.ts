import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../../lib/admin-auth';
import {
  createLineContact,
  deleteLineContact,
  LineContactValidationError,
  listLineContacts,
  parseLineContactInput,
  updateLineContact,
} from '../../../../lib/line-contacts';
import {
  RequestTooLargeError,
  readLimitedRequestBody,
} from '../../../../lib/request-body';

type Authenticate = typeof requireAdmin;

function json(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

async function readPayload(request: Request) {
  try {
    return JSON.parse(await readLimitedRequestBody(request, 4_000)) as unknown;
  } catch (error) {
    if (error instanceof RequestTooLargeError)
      throw new LineContactValidationError('request_too_large');
    throw new LineContactValidationError('invalid_request');
  }
}

export function createAdminLineContactsHandler(
  db: D1Database,
  authenticate: Authenticate = requireAdmin,
) {
  return async function handleLineContacts(request: Request) {
    const actor = await authenticate(request, db);
    if (!actor) return json('unauthorized', 401);
    if (actor.role !== 'admin') return json('forbidden', 403);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return json('origin_not_allowed', 403);
    try {
      if (request.method === 'GET') {
        return Response.json(
          { contacts: await listLineContacts(db, true) },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (request.method === 'POST') {
        const contact = await createLineContact(
          db,
          parseLineContactInput(await readPayload(request)),
          actor,
        );
        return Response.json(
          { contact },
          { status: 201, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      const payload = await readPayload(request);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return json('invalid_request', 400);
      const { id, ...input } = payload as Record<string, unknown>;
      if (!validId(id)) return json('invalid_request', 400);
      if (request.method === 'PUT') {
        const contact = await updateLineContact(
          db,
          id,
          parseLineContactInput(input),
          actor,
        );
        if (!contact) return json('not_found', 404);
        return Response.json(
          { contact },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (request.method === 'DELETE') {
        if (Object.keys(input).length) return json('invalid_request', 400);
        if (!(await deleteLineContact(db, id, actor)))
          return json('not_found', 404);
        return Response.json(
          { deleted: true },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      return json('method_not_allowed', 405);
    } catch (error) {
      if (error instanceof LineContactValidationError)
        return json(
          error.message,
          error.message === 'request_too_large' ? 413 : 400,
        );
      console.error('LINE contact management failed', error);
      return json('line_contact_operation_unavailable', 503);
    }
  };
}

function handler(request: Request) {
  return createAdminLineContactsHandler(
    (env as unknown as { DB: D1Database }).DB,
  )(request);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
