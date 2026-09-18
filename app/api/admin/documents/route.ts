import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../../lib/admin-auth';
import {
  createDocumentInput,
  createStoredDocument,
  deleteDocument,
  DocumentValidationError,
  findDocumentStorageKey,
  listDocuments,
} from '../../../../lib/document-repository';

type DocumentRuntime = { DB: D1Database; DOCUMENTS?: R2Bucket };
type Authenticate = typeof requireAdmin;

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

function decodedHeader(request: Request, name: string) {
  const value = request.headers.get(name);
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    throw new DocumentValidationError(`${name} is invalid`);
  }
}

function storageFilename(value: string) {
  return (
    value
      .normalize('NFKC')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'document.pdf'
  );
}

export function createDocumentsAdminHandler(
  runtime: DocumentRuntime,
  authenticate: Authenticate = requireAdmin,
) {
  return async function handleDocuments(request: Request) {
    const actor = await authenticate(request, runtime.DB);
    if (!actor) return json('unauthorized', 401);
    if (!hasTrustedOrigin(request)) return json('origin_not_allowed', 403);

    try {
      if (request.method === 'GET') {
        return Response.json(
          { records: await listDocuments(runtime.DB) },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (request.method === 'DELETE') {
        const payload = (await request.json()) as { id?: unknown };
        const id = typeof payload.id === 'string' ? payload.id : '';
        const document = await findDocumentStorageKey(runtime.DB, id);
        if (!document) return json('document_not_found', 404);
        if (!runtime.DOCUMENTS)
          return json('document_storage_unavailable', 503);
        await runtime.DOCUMENTS.delete(document.storage_key);
        await deleteDocument(runtime.DB, id, actor);
        return Response.json(
          { deleted: true },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (request.method !== 'POST') return json('method_not_allowed', 405);
      if (!runtime.DOCUMENTS) return json('document_storage_unavailable', 503);
      const contentLength = Number(
        request.headers.get('x-document-file-size') ??
          request.headers.get('content-length'),
      );
      const input = createDocumentInput({
        originalFilename: decodedHeader(
          request,
          'x-document-original-filename',
        ),
        displayTitle: decodedHeader(request, 'x-document-title'),
        category: decodedHeader(request, 'x-document-category'),
        sourceLanguage: request.headers.get('x-document-language'),
        accessLevel: request.headers.get('x-document-access'),
        fileSize: contentLength,
      });
      const contentType = request.headers.get('content-type')?.split(';')[0];
      if (contentType !== 'application/pdf') {
        return json('only_pdf_files_are_allowed', 400);
      }
      if (!request.body) return json('file_required', 400);

      const id = crypto.randomUUID();
      const storageKey = `documents/${id}/${storageFilename(input.originalFilename)}`;
      const uploaded = await runtime.DOCUMENTS.put(storageKey, request.body, {
        httpMetadata: { contentType: 'application/pdf' },
      });
      try {
        await createStoredDocument(runtime.DB, input, uploaded.etag, actor, id);
      } catch (error) {
        await runtime.DOCUMENTS.delete(storageKey);
        throw error;
      }
      return Response.json(
        { record: { id } },
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      if (error instanceof DocumentValidationError)
        return json(error.message, 400);
      console.error('Document operation failed', error);
      return json('document_operation_unavailable', 503);
    }
  };
}

function handler(request: Request) {
  return createDocumentsAdminHandler(env as unknown as DocumentRuntime)(
    request,
  );
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
