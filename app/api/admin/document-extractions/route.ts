import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../../lib/admin-auth';
import {
  automaticallyProcessDocument,
  processBrowserExtractedDocument,
} from '../../../../lib/document-processing';
import {
  DocumentValidationError,
  failDocumentExtraction,
  findDocumentForExtraction,
} from '../../../../lib/document-repository';

type DocumentRuntime = { DB: D1Database; DOCUMENTS?: R2Bucket };
const MAX_BROWSER_EXTRACTED_PAGES = 500;
const MAX_BROWSER_EXTRACTED_CHARACTERS = 1_000_000;

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

export function createDocumentExtractionHandler(
  runtime: DocumentRuntime,
  authenticate = requireAdmin,
) {
  return async function handleDocumentExtraction(request: Request) {
    const actor = await authenticate(request, runtime.DB);
    if (!actor) return json('unauthorized', 401);
    if (!hasTrustedOrigin(request)) return json('origin_not_allowed', 403);
    if (request.method !== 'POST') return json('method_not_allowed', 405);
    if (!runtime.DOCUMENTS) return json('document_storage_unavailable', 503);

    let document: Awaited<ReturnType<typeof findDocumentForExtraction>> = null;
    try {
      const payload = (await request.json()) as {
        id?: unknown;
        pages?: unknown;
      };
      const id = typeof payload.id === 'string' ? payload.id : '';
      document = await findDocumentForExtraction(runtime.DB, id);
      if (!document) return json('document_not_found', 404);

      const pages = payload.pages;
      if (Array.isArray(pages)) {
        if (
          !pages.length ||
          pages.length > MAX_BROWSER_EXTRACTED_PAGES ||
          pages.some((page) => typeof page !== 'string') ||
          pages.reduce(
            (total, page) =>
              total + (typeof page === 'string' ? page.length : 0),
            0,
          ) > MAX_BROWSER_EXTRACTED_CHARACTERS
        )
          return json('browser_extracted_pages_invalid', 400);
      }
      const result = Array.isArray(pages)
        ? await processBrowserExtractedDocument(
            { DB: runtime.DB },
            id,
            pages,
            actor,
          )
        : await automaticallyProcessDocument(
            { DB: runtime.DB, DOCUMENTS: runtime.DOCUMENTS },
            id,
            actor,
          );
      return Response.json(result, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      if (document) {
        const latest = await findDocumentForExtraction(runtime.DB, document.id);
        if (latest?.assistant_status === 'processing') {
          const reason =
            error instanceof Error
              ? error.message
              : 'document_extraction_failed';
          await failDocumentExtraction(runtime.DB, latest, actor, reason).catch(
            () => undefined,
          );
        }
      }
      if (error instanceof DocumentValidationError)
        return json(error.message, 400);
      console.error('Document extraction failed', error);
      return json('document_extraction_unavailable', 503);
    }
  };
}

function handler(request: Request) {
  return createDocumentExtractionHandler(env as unknown as DocumentRuntime)(
    request,
  );
}

export const POST = handler;
