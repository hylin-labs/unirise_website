import { env } from 'cloudflare:workers';
import { extractText, getDocumentProxy } from 'unpdf';
import { requireAdmin } from '../../../../lib/admin-auth';
import { chunkExtractedPages } from '../../../../lib/document-extraction';
import {
  completeDocumentExtraction,
  DocumentValidationError,
  failDocumentExtraction,
  findDocumentForExtraction,
  markDocumentProcessing,
} from '../../../../lib/document-repository';

type DocumentRuntime = { DB: D1Database; DOCUMENTS?: R2Bucket };

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
    let markedProcessing = false;
    try {
      const payload = (await request.json()) as { id?: unknown };
      const id = typeof payload.id === 'string' ? payload.id : '';
      document = await findDocumentForExtraction(runtime.DB, id);
      if (!document) return json('document_not_found', 404);
      await markDocumentProcessing(runtime.DB, document, actor);
      markedProcessing = true;

      const stored = await runtime.DOCUMENTS.get(document.storage_key);
      if (!stored) throw new Error('document_file_not_found');
      const pdf = await getDocumentProxy(
        new Uint8Array(await stored.arrayBuffer()),
      );
      const extracted = await extractText(pdf, { mergePages: false });
      const pages = Array.isArray(extracted.text)
        ? extracted.text
        : [extracted.text];
      const { chunks, characterCount } = chunkExtractedPages(pages);
      if (!chunks.length) throw new Error('no_extractable_text');
      await completeDocumentExtraction(
        runtime.DB,
        document,
        chunks,
        extracted.totalPages,
        characterCount,
        actor,
      );
      return Response.json(
        {
          documentId: document.id,
          pageCount: extracted.totalPages,
          chunkCount: chunks.length,
          characterCount,
          status: 'review_required',
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      if (markedProcessing && document) {
        const reason =
          error instanceof Error ? error.message : 'document_extraction_failed';
        await failDocumentExtraction(runtime.DB, document, actor, reason).catch(
          () => undefined,
        );
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
