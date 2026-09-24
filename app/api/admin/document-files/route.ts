import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../../lib/admin-auth';
import { findDocumentForExtraction } from '../../../../lib/document-repository';

type DocumentRuntime = { DB: D1Database; DOCUMENTS?: R2Bucket };

function json(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function createDocumentFileHandler(
  runtime: DocumentRuntime,
  authenticate = requireAdmin,
) {
  return async function handleDocumentFile(request: Request) {
    const actor = await authenticate(request, runtime.DB);
    if (!actor) return json('unauthorized', 401);
    if (request.method !== 'GET') return json('method_not_allowed', 405);
    if (!runtime.DOCUMENTS) return json('document_storage_unavailable', 503);

    const id = new URL(request.url).searchParams.get('id') ?? '';
    const document = await findDocumentForExtraction(runtime.DB, id);
    if (!document) return json('document_not_found', 404);
    const stored = await runtime.DOCUMENTS.get(document.storage_key);
    if (!stored) return json('document_file_not_found', 404);

    return new Response(stored.body, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': document.mime_type,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  };
}

function handler(request: Request) {
  return createDocumentFileHandler(env as unknown as DocumentRuntime)(request);
}

export const GET = handler;
