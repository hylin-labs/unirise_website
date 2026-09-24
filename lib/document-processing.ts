import type { AdminIdentity } from './admin-auth';
import { chunkExtractedPages } from './document-extraction';
import { extractDocumentPages } from './office-document-extraction';
import {
  completeDocumentExtraction,
  excludeDocumentAfterSafetyScreening,
  findDocumentForExtraction,
  markDocumentProcessing,
} from './document-repository';
import { screenDocumentChunksForAssistant } from './document-safety';

export type DocumentProcessingRuntime = {
  DB: D1Database;
  DOCUMENTS?: R2Bucket;
};

export type AutomaticDocumentProcessingResult = {
  documentId: string;
  status: 'approved' | 'excluded';
  pageCount: number;
  chunkCount: number;
  excludedChunkCount: number;
  characterCount: number;
};

export async function processBrowserExtractedDocument(
  runtime: Pick<DocumentProcessingRuntime, 'DB'>,
  id: string,
  pages: string[],
  actor: AdminIdentity,
): Promise<AutomaticDocumentProcessingResult> {
  const document = await findDocumentForExtraction(runtime.DB, id);
  if (!document) throw new Error('document_not_found');
  if (document.assistant_status !== 'processing')
    await markDocumentProcessing(runtime.DB, document, actor);

  const { chunks, characterCount } = chunkExtractedPages(pages);
  if (!chunks.length) throw new Error('no_extractable_text');

  const screening = screenDocumentChunksForAssistant(chunks);
  if (!screening.safeChunks.length) {
    await excludeDocumentAfterSafetyScreening(
      runtime.DB,
      document,
      pages.length,
      characterCount,
      screening.excludedChunkCount,
      actor,
    );
    return {
      documentId: document.id,
      status: 'excluded',
      pageCount: pages.length,
      chunkCount: 0,
      excludedChunkCount: screening.excludedChunkCount,
      characterCount,
    };
  }

  await completeDocumentExtraction(
    runtime.DB,
    document,
    screening.safeChunks,
    pages.length,
    characterCount,
    actor,
    { autoApprove: true, excludedChunkCount: screening.excludedChunkCount },
  );
  return {
    documentId: document.id,
    status: 'approved',
    pageCount: pages.length,
    chunkCount: screening.safeChunks.length,
    excludedChunkCount: screening.excludedChunkCount,
    characterCount,
  };
}

export async function automaticallyProcessDocument(
  runtime: Required<DocumentProcessingRuntime>,
  id: string,
  actor: AdminIdentity,
): Promise<AutomaticDocumentProcessingResult> {
  const document = await findDocumentForExtraction(runtime.DB, id);
  if (!document) throw new Error('document_not_found');
  await markDocumentProcessing(runtime.DB, document, actor);

  const stored = await runtime.DOCUMENTS.get(document.storage_key);
  if (!stored) throw new Error('document_file_not_found');
  const extracted = await extractDocumentPages(
    await stored.arrayBuffer(),
    document.mime_type,
  );
  const { chunks, characterCount } = chunkExtractedPages(extracted.pages);
  if (!chunks.length) throw new Error('no_extractable_text');

  const screening = screenDocumentChunksForAssistant(chunks);
  if (!screening.safeChunks.length) {
    await excludeDocumentAfterSafetyScreening(
      runtime.DB,
      document,
      extracted.pageCount,
      characterCount,
      screening.excludedChunkCount,
      actor,
    );
    return {
      documentId: document.id,
      status: 'excluded',
      pageCount: extracted.pageCount,
      chunkCount: 0,
      excludedChunkCount: screening.excludedChunkCount,
      characterCount,
    };
  }

  await completeDocumentExtraction(
    runtime.DB,
    document,
    screening.safeChunks,
    extracted.pageCount,
    characterCount,
    actor,
    { autoApprove: true, excludedChunkCount: screening.excludedChunkCount },
  );
  return {
    documentId: document.id,
    status: 'approved',
    pageCount: extracted.pageCount,
    chunkCount: screening.safeChunks.length,
    excludedChunkCount: screening.excludedChunkCount,
    characterCount,
  };
}
