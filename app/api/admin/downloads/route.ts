import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../../lib/admin-auth';
import {
  ContentValidationError,
  saveDownload,
  setDownloadPublication,
  type ContentStatus,
  type DownloadInput,
} from '../../../../lib/content-repository';

type Authenticate = typeof requireAdmin;

function json(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function createDownloadsAdminHandler(
  db: D1Database,
  authenticate: Authenticate = requireAdmin,
) {
  return async function handleDownloadMutation(request: Request) {
    const actor = await authenticate(request, db);
    if (!actor) return json('unauthorized', 401);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return json('origin_not_allowed', 403);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json('invalid_request', 400);
    }

    try {
      if (request.method === 'PATCH') {
        const publication = payload as { id?: unknown; status?: unknown };
        const id = typeof publication.id === 'string' ? publication.id : '';
        await setDownloadPublication(
          db,
          id,
          publication.status as ContentStatus,
          actor,
        );
        return Response.json(
          { updated: true },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      const record = await saveDownload(db, payload as DownloadInput, actor);
      return Response.json(
        { record },
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      if (error instanceof ContentValidationError) {
        return json('invalid_content', 400);
      }
      console.error('Download mutation failed', error);
      return json('content_unavailable', 503);
    }
  };
}

function handler(request: Request) {
  return createDownloadsAdminHandler((env as unknown as { DB: D1Database }).DB)(
    request,
  );
}

export const POST = handler;
export const PATCH = handler;
