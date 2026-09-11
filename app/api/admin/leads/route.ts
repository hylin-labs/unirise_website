import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../../lib/admin-auth';
import { uniriseSchema } from '../../../../db/schema';
import { RequestTooLargeError, readLimitedRequestBody } from '../../../../lib/request-body';

type LeadStatus = 'new' | 'contacted' | 'closed';
type Authenticate = typeof requireAdmin;

function json(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function validStatus(value: unknown): value is LeadStatus {
  return value === 'new' || value === 'contacted' || value === 'closed';
}

export function createAdminLeadsHandler(
  db: D1Database,
  authenticate: Authenticate = requireAdmin,
) {
  return async function handleLeadMutation(request: Request) {
    const actor = await authenticate(request, db);
    if (!actor) return json('unauthorized', 401);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return json('origin_not_allowed', 403);
    if (request.method !== 'PATCH') return json('method_not_allowed', 405);

    let payload: { id?: unknown; status?: unknown };
    try {
      payload = JSON.parse(await readLimitedRequestBody(request, 2_000));
    } catch (error) {
      if (error instanceof RequestTooLargeError)
        return json('request_too_large', 413);
      return json('invalid_request', 400);
    }
    const id = typeof payload.id === 'string' ? payload.id.trim() : '';
    if (!id || id.length > 160 || !validStatus(payload.status))
      return json('invalid_request', 400);

    const current = await db
      .prepare(`SELECT status FROM ${uniriseSchema.chatLeads} WHERE id = ?`)
      .bind(id)
      .first<{ status: LeadStatus }>();
    if (!current) return json('not_found', 404);
    if (current.status === payload.status)
      return Response.json(
        { updated: false },
        { headers: { 'Cache-Control': 'no-store' } },
      );

    const timestamp = new Date().toISOString();
    await db.batch([
      db
        .prepare(
          `UPDATE ${uniriseSchema.chatLeads} SET status = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(payload.status, timestamp, id),
      db
        .prepare(
          `INSERT INTO ${uniriseSchema.adminAuditLog} (id, admin_user_id, action, target_type, target_id, detail_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          actor.id,
          'lead.status_updated',
          'lead',
          id,
          JSON.stringify({ from: current.status, to: payload.status }),
          timestamp,
        ),
    ]);
    return Response.json(
      { updated: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  };
}

function handler(request: Request) {
  return createAdminLeadsHandler((env as unknown as { DB: D1Database }).DB)(
    request,
  );
}

export const PATCH = handler;
