import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../../lib/admin-auth';
import {
  approveAllDocumentChunks,
  DocumentValidationError,
  getDocumentReview,
  reviewDocumentChunk,
} from '../../../../lib/document-repository';

type ReviewRuntime = { DB: D1Database };

function json(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function hasTrustedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export function createDocumentReviewHandler(
  runtime: ReviewRuntime,
  authenticate = requireAdmin,
) {
  return async function handleDocumentReview(request: Request) {
    const actor = await authenticate(request, runtime.DB);
    if (!actor) return json('unauthorized', 401);
    if (!hasTrustedOrigin(request)) return json('origin_not_allowed', 403);

    try {
      if (request.method === 'GET') {
        const id = new URL(request.url).searchParams.get('id');
        return Response.json(
          { review: await getDocumentReview(runtime.DB, id) },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      const body = (await request.json()) as Record<string, unknown>;
      if (request.method === 'PATCH') {
        return Response.json(
          {
            review: await reviewDocumentChunk(
              runtime.DB,
              {
                documentId: body.documentId,
                chunkId: body.chunkId,
                action: body.action,
                content: body.content,
              },
              actor,
            ),
          },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (request.method === 'POST') {
        if (body.action !== 'approve_all')
          throw new DocumentValidationError('action is invalid');
        return Response.json(
          {
            review: await approveAllDocumentChunks(
              runtime.DB,
              body.documentId,
              actor,
            ),
          },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      return json('method_not_allowed', 405);
    } catch (error) {
      if (error instanceof DocumentValidationError)
        return json(error.message, 400);
      console.error('Document review operation failed', error);
      return json('document_review_unavailable', 503);
    }
  };
}

function handler(request: Request) {
  return createDocumentReviewHandler(env as unknown as ReviewRuntime)(request);
}

export const GET = handler;
export const PATCH = handler;
export const POST = handler;
