import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../../lib/admin-auth';
import { automaticallyProcessDocument } from '../../../../lib/document-processing';
import {
  createDocumentInput,
  createStoredDocument,
  deleteDocument,
  DocumentValidationError,
  failDocumentExtraction,
  findDocumentForExtraction,
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
      .slice(0, 120) || 'document'
  );
}

function hasExpectedFileSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'application/pdf')
    return (
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    );
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
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
      if (!request.body) return json('file_required', 400);
      const bytes = new Uint8Array(await request.arrayBuffer());
      const input = createDocumentInput({
        originalFilename: decodedHeader(
          request,
          'x-document-original-filename',
        ),
        displayTitle: decodedHeader(request, 'x-document-title'),
        category: decodedHeader(request, 'x-document-category'),
        sourceLanguage: request.headers.get('x-document-language'),
        accessLevel: request.headers.get('x-document-access'),
        fileSize: bytes.byteLength,
      });
      const contentType = request.headers.get('content-type')?.split(';')[0];
      if (contentType !== input.mimeType)
        return json('document_content_type_mismatch', 400);
      if (!hasExpectedFileSignature(bytes, input.mimeType))
        return json('document_file_signature_invalid', 400);

      const id = crypto.randomUUID();
      const storageKey = `documents/${id}/${storageFilename(input.originalFilename)}`;
      const uploaded = await runtime.DOCUMENTS.put(storageKey, bytes, {
        httpMetadata: { contentType: input.mimeType },
      });
      let created = false;
      try {
        await createStoredDocument(runtime.DB, input, uploaded.etag, actor, id);
        created = true;
      } catch (error) {
        await runtime.DOCUMENTS.delete(storageKey);
        throw error;
      }

      if (input.accessLevel === 'confidential') {
        return Response.json(
          { record: { id, status: 'excluded' } },
          { status: 201, headers: { 'Cache-Control': 'no-store' } },
        );
      }

      try {
        const result = await automaticallyProcessDocument(
          { DB: runtime.DB, DOCUMENTS: runtime.DOCUMENTS },
          id,
          actor,
        );
        return Response.json(
          { record: { id, ...result } },
          { status: 201, headers: { 'Cache-Control': 'no-store' } },
        );
      } catch (error) {
        if (created) {
          const document = await findDocumentForExtraction(runtime.DB, id);
          if (document?.assistant_status === 'processing') {
            const reason =
              error instanceof Error
                ? error.message
                : 'document_extraction_failed';
            await failDocumentExtraction(runtime.DB, document, actor, reason);
          }
        }
        console.error('Automatic document processing failed', error);
        return Response.json(
          { record: { id, status: 'failed' } },
          { status: 201, headers: { 'Cache-Control': 'no-store' } },
        );
      }
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
