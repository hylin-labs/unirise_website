import { uniriseSchema } from '../db/schema';
import type { AdminIdentity } from './admin-auth';
import { extractDeterministicDocumentFacts } from './document-facts';

export const documentLanguages = ['zh-TW', 'en', 'mixed'] as const;
export const documentAccessLevels = [
  'public',
  'internal',
  'confidential',
] as const;
export const documentAssistantStatuses = [
  'pending',
  'processing',
  'review_required',
  'approved',
  'excluded',
  'failed',
] as const;

export const documentFactTypes = [
  'specification',
  'operation',
  'safety',
  'maintenance',
  'compatibility',
  'contact',
] as const;

export const documentFactReviewStatuses = [
  'pending',
  'approved',
  'rejected',
  'excluded',
] as const;

export const documentFactOrigins = [
  'text',
  'ocr',
  'vision',
  'model',
  'manual',
] as const;

export type DocumentLanguage = (typeof documentLanguages)[number];
export type DocumentAccessLevel = (typeof documentAccessLevels)[number];
export type DocumentAssistantStatus =
  (typeof documentAssistantStatuses)[number];
export type DocumentFactType = (typeof documentFactTypes)[number];
export type DocumentFactReviewStatus =
  (typeof documentFactReviewStatuses)[number];
export type DocumentFactOrigin = (typeof documentFactOrigins)[number];

export type KnowledgeDocument = {
  id: string;
  originalFilename: string;
  displayTitle: string;
  category: string;
  sourceLanguage: DocumentLanguage;
  accessLevel: DocumentAccessLevel;
  assistantStatus: DocumentAssistantStatus;
  mimeType: 'application/pdf';
  fileSize: number;
  extractionPageCount: number | null;
  extractionCharacters: number | null;
  extractionError: string | null;
  sourceHash: string | null;
  sourceVersion: string | null;
  processingPipelineVersion: string | null;
  canonicalFormat: string | null;
  knowledgeSummaryZh: string | null;
  knowledgeSummaryEn: string | null;
  publicKnowledgeAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentKnowledgeFact = {
  id: string;
  documentId: string;
  chunkId: string | null;
  factType: DocumentFactType;
  subject: string;
  predicate: string;
  value: string;
  unit: string | null;
  sourceLanguage: DocumentLanguage;
  sourcePageStart: number;
  sourcePageEnd: number;
  sourceLocator: string | null;
  sourceExcerpt: string;
  confidence: number;
  extractionOrigin: DocumentFactOrigin;
  reviewStatus: DocumentFactReviewStatus;
  updatedAt: string;
};

export type DocumentReviewChunk = {
  id: string;
  documentId: string;
  chunkNumber: number;
  pageStart: number;
  pageEnd: number;
  language: DocumentLanguage;
  content: string;
  status: 'review_required' | 'approved' | 'rejected';
  updatedAt: string;
};

export type DocumentReview = {
  document: KnowledgeDocument;
  chunks: DocumentReviewChunk[];
  summary: { reviewRequired: number; approved: number; rejected: number };
};

type DocumentRow = {
  id: string;
  original_filename: string;
  display_title: string;
  category: string;
  source_language: DocumentLanguage;
  access_level: DocumentAccessLevel;
  assistant_status: DocumentAssistantStatus;
  mime_type: 'application/pdf';
  file_size: number;
  extraction_page_count: number | null;
  extraction_characters: number | null;
  extraction_error: string | null;
  source_hash: string | null;
  source_version: string | null;
  processing_pipeline_version: string | null;
  canonical_format: string | null;
  knowledge_summary_zh: string | null;
  knowledge_summary_en: string | null;
  public_knowledge_at: string | null;
  created_at: string;
  updated_at: string;
};

type DocumentKnowledgeFactRow = {
  id: string;
  document_id: string;
  chunk_id: string | null;
  fact_type: DocumentFactType;
  subject: string;
  predicate: string;
  value: string;
  unit: string | null;
  source_language: DocumentLanguage;
  source_page_start: number;
  source_page_end: number;
  source_locator: string | null;
  source_excerpt: string;
  confidence: number;
  extraction_origin: DocumentFactOrigin;
  review_status: DocumentFactReviewStatus;
  updated_at: string;
};

type ExtractionDocument = {
  id: string;
  storage_key: string;
  display_title: string;
  source_language: DocumentLanguage;
  access_level: DocumentAccessLevel;
  assistant_status: DocumentAssistantStatus;
};

type DocumentReviewChunkRow = {
  id: string;
  document_id: string;
  chunk_number: number;
  page_start: number;
  page_end: number;
  language: DocumentLanguage;
  content: string;
  status: DocumentReviewChunk['status'];
  updated_at: string;
};

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}

function requiredText(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string')
    throw new DocumentValidationError(`${field} must be text`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new DocumentValidationError(
      `${field} must be 1-${maximum} characters`,
    );
  }
  return normalized;
}

function allowedValue<T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  if (typeof value === 'string' && allowed.includes(value))
    return value as T[number];
  throw new DocumentValidationError(`${field} is invalid`);
}

function optionalText(value: unknown, field: string, maximum: number) {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, field, maximum);
}

function pageNumber(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new DocumentValidationError(
      `${field} must be a positive page number`,
    );
  }
  return value;
}

function confidenceValue(value: unknown) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new DocumentValidationError('confidence must be between 0 and 1');
  }
  return value;
}

function rowToDocument(row: DocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    displayTitle: row.display_title,
    category: row.category,
    sourceLanguage: row.source_language,
    accessLevel: row.access_level,
    assistantStatus: row.assistant_status,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    extractionPageCount: row.extraction_page_count,
    extractionCharacters: row.extraction_characters,
    extractionError: row.extraction_error,
    sourceHash: row.source_hash,
    sourceVersion: row.source_version,
    processingPipelineVersion: row.processing_pipeline_version,
    canonicalFormat: row.canonical_format,
    knowledgeSummaryZh: row.knowledge_summary_zh,
    knowledgeSummaryEn: row.knowledge_summary_en,
    publicKnowledgeAt: row.public_knowledge_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToDocumentFact(
  row: DocumentKnowledgeFactRow,
): DocumentKnowledgeFact {
  return {
    id: row.id,
    documentId: row.document_id,
    chunkId: row.chunk_id,
    factType: row.fact_type,
    subject: row.subject,
    predicate: row.predicate,
    value: row.value,
    unit: row.unit,
    sourceLanguage: row.source_language,
    sourcePageStart: row.source_page_start,
    sourcePageEnd: row.source_page_end,
    sourceLocator: row.source_locator,
    sourceExcerpt: row.source_excerpt,
    confidence: row.confidence,
    extractionOrigin: row.extraction_origin,
    reviewStatus: row.review_status,
    updatedAt: row.updated_at,
  };
}

function chunkToReviewRow(row: DocumentReviewChunkRow): DocumentReviewChunk {
  return {
    id: row.id,
    documentId: row.document_id,
    chunkNumber: row.chunk_number,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    language: row.language,
    content: row.content,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function auditStatement(
  db: D1Database,
  actor: AdminIdentity,
  action: string,
  targetId: string,
  detail: Record<string, unknown>,
) {
  return db
    .prepare(
      `INSERT INTO ${uniriseSchema.adminAuditLog} (id, admin_user_id, action, target_type, target_id, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actor.id,
      action,
      'knowledge_document',
      targetId,
      JSON.stringify(detail),
      new Date().toISOString(),
    );
}

export function createDocumentInput(value: {
  originalFilename: unknown;
  displayTitle: unknown;
  category: unknown;
  sourceLanguage: unknown;
  accessLevel: unknown;
  fileSize: unknown;
}) {
  const originalFilename = requiredText(
    value.originalFilename,
    'originalFilename',
    255,
  );
  if (!originalFilename.toLowerCase().endsWith('.pdf')) {
    throw new DocumentValidationError('only PDF files are allowed');
  }
  const fileSize = value.fileSize;
  if (
    typeof fileSize !== 'number' ||
    !Number.isSafeInteger(fileSize) ||
    fileSize < 1 ||
    fileSize > 52_428_800
  ) {
    throw new DocumentValidationError(
      'fileSize must be between 1 byte and 50 MB',
    );
  }
  return {
    originalFilename,
    displayTitle: requiredText(value.displayTitle, 'displayTitle', 255),
    category: requiredText(value.category, 'category', 80),
    sourceLanguage: allowedValue(
      value.sourceLanguage,
      'sourceLanguage',
      documentLanguages,
    ),
    accessLevel: allowedValue(
      value.accessLevel,
      'accessLevel',
      documentAccessLevels,
    ),
    fileSize,
  };
}

export function createDocumentFactInput(value: {
  documentId: unknown;
  chunkId?: unknown;
  factType: unknown;
  subject: unknown;
  predicate: unknown;
  value: unknown;
  unit?: unknown;
  sourceLanguage: unknown;
  sourcePageStart: unknown;
  sourcePageEnd: unknown;
  sourceLocator?: unknown;
  sourceExcerpt: unknown;
  confidence: unknown;
  extractionOrigin: unknown;
  reviewStatus?: unknown;
}) {
  const sourcePageStart = pageNumber(value.sourcePageStart, 'sourcePageStart');
  const sourcePageEnd = pageNumber(value.sourcePageEnd, 'sourcePageEnd');
  if (sourcePageEnd < sourcePageStart) {
    throw new DocumentValidationError(
      'sourcePageEnd must not be before sourcePageStart',
    );
  }
  return {
    documentId: requiredText(value.documentId, 'documentId', 80),
    chunkId: optionalText(value.chunkId, 'chunkId', 80),
    factType: allowedValue(value.factType, 'factType', documentFactTypes),
    subject: requiredText(value.subject, 'subject', 240),
    predicate: requiredText(value.predicate, 'predicate', 120),
    value: requiredText(value.value, 'value', 1_000),
    unit: optionalText(value.unit, 'unit', 80),
    sourceLanguage: allowedValue(
      value.sourceLanguage,
      'sourceLanguage',
      documentLanguages,
    ),
    sourcePageStart,
    sourcePageEnd,
    sourceLocator: optionalText(value.sourceLocator, 'sourceLocator', 500),
    sourceExcerpt: requiredText(value.sourceExcerpt, 'sourceExcerpt', 6_000),
    confidence: confidenceValue(value.confidence),
    extractionOrigin: allowedValue(
      value.extractionOrigin,
      'extractionOrigin',
      documentFactOrigins,
    ),
    reviewStatus:
      value.reviewStatus === undefined
        ? ('pending' as const)
        : allowedValue(
            value.reviewStatus,
            'reviewStatus',
            documentFactReviewStatuses,
          ),
  };
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

export async function createStoredDocument(
  db: D1Database,
  input: ReturnType<typeof createDocumentInput>,
  r2Etag: string | null,
  actor: AdminIdentity,
  id = crypto.randomUUID(),
) {
  const now = new Date().toISOString();
  const storageKey = `documents/${id}/${storageFilename(input.originalFilename)}`;
  const statements = [
    db
      .prepare(
        `INSERT INTO ${uniriseSchema.documents} (id, original_filename, storage_key, display_title, category, source_language, access_level, assistant_status, mime_type, file_size, r2_etag, uploaded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.originalFilename,
        storageKey,
        input.displayTitle,
        input.category,
        input.sourceLanguage,
        input.accessLevel,
        input.accessLevel === 'confidential' ? 'excluded' : 'pending',
        'application/pdf',
        input.fileSize,
        r2Etag,
        actor.id,
        now,
        now,
      ),
    auditStatement(db, actor, 'document.uploaded', id, {
      accessLevel: input.accessLevel,
      filename: input.originalFilename,
      fileSize: input.fileSize,
    }),
  ];
  await db.batch(statements);
  return { id, storageKey };
}

export async function listDocuments(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT id, original_filename, display_title, category, source_language, access_level, assistant_status, mime_type, file_size, extraction_page_count, extraction_characters, extraction_error, source_hash, source_version, processing_pipeline_version, canonical_format, knowledge_summary_zh, knowledge_summary_en, public_knowledge_at, created_at, updated_at
       FROM ${uniriseSchema.documents}
       ORDER BY updated_at DESC`,
    )
    .all<DocumentRow>();
  return rows.results.map(rowToDocument);
}

async function findDocumentForReview(db: D1Database, id: unknown) {
  if (typeof id !== 'string' || !id.trim())
    throw new DocumentValidationError('id is required');
  return db
    .prepare(
      `SELECT id, original_filename, display_title, category, source_language, access_level, assistant_status, mime_type, file_size, extraction_page_count, extraction_characters, extraction_error, source_hash, source_version, processing_pipeline_version, canonical_format, knowledge_summary_zh, knowledge_summary_en, public_knowledge_at, created_at, updated_at
       FROM ${uniriseSchema.documents} WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<DocumentRow>();
}

function reviewSummary(chunks: DocumentReviewChunk[]) {
  return chunks.reduce(
    (summary, chunk) => {
      summary[
        chunk.status === 'review_required' ? 'reviewRequired' : chunk.status
      ] += 1;
      return summary;
    },
    { reviewRequired: 0, approved: 0, rejected: 0 },
  );
}

export async function getDocumentReview(db: D1Database, id: unknown) {
  const document = await findDocumentForReview(db, id);
  if (!document) throw new DocumentValidationError('document_not_found');
  const rows = await db
    .prepare(
      `SELECT id, document_id, chunk_number, page_start, page_end, language, content, status, updated_at
       FROM ${uniriseSchema.documentChunks}
       WHERE document_id = ? ORDER BY chunk_number ASC`,
    )
    .bind(document.id)
    .all<DocumentReviewChunkRow>();
  const chunks = rows.results.map(chunkToReviewRow);
  return {
    document: rowToDocument(document),
    chunks,
    summary: reviewSummary(chunks),
  } satisfies DocumentReview;
}

export async function upsertDocumentKnowledgeFact(
  db: D1Database,
  value: Parameters<typeof createDocumentFactInput>[0],
  actor: AdminIdentity,
  id = crypto.randomUUID(),
) {
  const input = createDocumentFactInput(value);
  const document = await findDocumentForReview(db, input.documentId);
  if (!document) throw new DocumentValidationError('document_not_found');
  if (document.access_level === 'confidential') {
    throw new DocumentValidationError(
      'confidential_documents_cannot_add_facts',
    );
  }
  if (input.chunkId) {
    const chunk = await db
      .prepare(
        `SELECT id FROM ${uniriseSchema.documentChunks}
         WHERE id = ? AND document_id = ? LIMIT 1`,
      )
      .bind(input.chunkId, input.documentId)
      .first<{ id: string }>();
    if (!chunk) throw new DocumentValidationError('document_chunk_not_found');
  }
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO ${uniriseSchema.documentFacts} (id, document_id, chunk_id, fact_type, subject, predicate, value, unit, source_language, source_page_start, source_page_end, source_locator, source_excerpt, confidence, extraction_origin, review_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(document_id, subject, predicate, value, source_page_start, source_page_end)
         DO UPDATE SET chunk_id = excluded.chunk_id, unit = excluded.unit, source_language = excluded.source_language, source_locator = excluded.source_locator, source_excerpt = excluded.source_excerpt, confidence = excluded.confidence, extraction_origin = excluded.extraction_origin, review_status = excluded.review_status, updated_at = excluded.updated_at`,
      )
      .bind(
        id,
        input.documentId,
        input.chunkId,
        input.factType,
        input.subject,
        input.predicate,
        input.value,
        input.unit,
        input.sourceLanguage,
        input.sourcePageStart,
        input.sourcePageEnd,
        input.sourceLocator,
        input.sourceExcerpt,
        input.confidence,
        input.extractionOrigin,
        input.reviewStatus,
        now,
        now,
      ),
    auditStatement(db, actor, 'document.fact_upserted', input.documentId, {
      factType: input.factType,
      sourcePages: [input.sourcePageStart, input.sourcePageEnd],
      reviewStatus: input.reviewStatus,
    }),
  ]);
}

export async function reviewDocumentKnowledgeFact(
  db: D1Database,
  input: { documentId: unknown; factId: unknown; reviewStatus: unknown },
  actor: AdminIdentity,
) {
  const documentId = requiredText(input.documentId, 'documentId', 80);
  const factId = requiredText(input.factId, 'factId', 80);
  const reviewStatus = allowedValue(
    input.reviewStatus,
    'reviewStatus',
    documentFactReviewStatuses,
  );
  const document = await findDocumentForReview(db, documentId);
  if (!document) throw new DocumentValidationError('document_not_found');
  if (document.access_level === 'confidential') {
    throw new DocumentValidationError(
      'confidential_documents_cannot_review_facts',
    );
  }
  const now = new Date().toISOString();
  const [updated] = await db.batch([
    db
      .prepare(
        `UPDATE ${uniriseSchema.documentFacts}
         SET review_status = ?, updated_at = ?
         WHERE id = ? AND document_id = ?`,
      )
      .bind(reviewStatus, now, factId, documentId),
    auditStatement(db, actor, 'document.fact_reviewed', documentId, {
      factId,
      reviewStatus,
    }),
  ]);
  if (updated.meta.changes !== 1) {
    throw new DocumentValidationError('document_fact_not_found');
  }
}

export async function listApprovedDocumentFacts(db: D1Database, limit = 30) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new DocumentValidationError('limit must be between 1 and 100');
  }
  const rows = await db
    .prepare(
      `SELECT facts.id, facts.document_id, facts.chunk_id, facts.fact_type, facts.subject, facts.predicate, facts.value, facts.unit, facts.source_language, facts.source_page_start, facts.source_page_end, facts.source_locator, facts.source_excerpt, facts.confidence, facts.extraction_origin, facts.review_status, facts.updated_at
       FROM ${uniriseSchema.documentFacts} AS facts
       INNER JOIN ${uniriseSchema.documents} AS documents ON documents.id = facts.document_id
       WHERE documents.access_level = 'public'
         AND documents.assistant_status = 'approved'
         AND facts.review_status = 'approved'
       ORDER BY facts.confidence DESC, facts.updated_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<DocumentKnowledgeFactRow>();
  return rows.results.map(rowToDocumentFact);
}

async function syncDocumentReviewStatus(
  db: D1Database,
  documentId: string,
  actor: AdminIdentity,
) {
  const review = await getDocumentReview(db, documentId);
  const now = new Date().toISOString();
  const nextStatus = review.summary.reviewRequired
    ? 'review_required'
    : review.summary.approved
      ? 'approved'
      : 'excluded';
  await db
    .prepare(
      `UPDATE ${uniriseSchema.documents}
       SET assistant_status = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(nextStatus, now, actor.id, now, documentId)
    .run();
  return getDocumentReview(db, documentId);
}

export async function reviewDocumentChunk(
  db: D1Database,
  input: {
    documentId: unknown;
    chunkId: unknown;
    action: unknown;
    content?: unknown;
  },
  actor: AdminIdentity,
) {
  const documentId = requiredText(input.documentId, 'documentId', 80);
  const chunkId = requiredText(input.chunkId, 'chunkId', 80);
  const action = allowedValue(input.action, 'action', [
    'approve',
    'reject',
    'save',
  ] as const);
  const document = await findDocumentForReview(db, documentId);
  if (!document) throw new DocumentValidationError('document_not_found');
  if (document.access_level === 'confidential')
    throw new DocumentValidationError(
      'confidential_documents_cannot_be_reviewed',
    );
  const chunk = await db
    .prepare(
      `SELECT id FROM ${uniriseSchema.documentChunks}
       WHERE id = ? AND document_id = ? LIMIT 1`,
    )
    .bind(chunkId, documentId)
    .first<{ id: string }>();
  if (!chunk) throw new DocumentValidationError('document_chunk_not_found');
  const now = new Date().toISOString();
  const content =
    action === 'save'
      ? requiredText(input.content, 'content', 12_000)
      : undefined;
  const statements = [
    action === 'save'
      ? db
          .prepare(
            `UPDATE ${uniriseSchema.documentChunks}
             SET content = ?, updated_at = ? WHERE id = ?`,
          )
          .bind(content, now, chunk.id)
      : db
          .prepare(
            `UPDATE ${uniriseSchema.documentChunks}
             SET status = ?, updated_at = ? WHERE id = ?`,
          )
          .bind(action === 'approve' ? 'approved' : 'rejected', now, chunk.id),
    auditStatement(db, actor, `document.chunk_${action}`, documentId, {
      chunkId,
    }),
  ];
  await db.batch(statements);
  return syncDocumentReviewStatus(db, documentId, actor);
}

export async function approveAllDocumentChunks(
  db: D1Database,
  documentId: unknown,
  actor: AdminIdentity,
) {
  const id = requiredText(documentId, 'documentId', 80);
  const document = await findDocumentForReview(db, id);
  if (!document) throw new DocumentValidationError('document_not_found');
  if (document.access_level === 'confidential')
    throw new DocumentValidationError(
      'confidential_documents_cannot_be_reviewed',
    );
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE ${uniriseSchema.documentChunks}
         SET status = 'approved', updated_at = ?
         WHERE document_id = ? AND status = 'review_required'`,
      )
      .bind(now, id),
    auditStatement(db, actor, 'document.chunks_approved', id, {}),
  ]);
  return syncDocumentReviewStatus(db, id, actor);
}

export type ExtractedDocumentChunk = {
  content: string;
  pageStart: number;
  pageEnd: number;
};

export async function findDocumentForExtraction(db: D1Database, id: string) {
  if (typeof id !== 'string' || !id.trim())
    throw new DocumentValidationError('id is required');
  return db
    .prepare(
        `SELECT id, storage_key, display_title, source_language, access_level, assistant_status
       FROM ${uniriseSchema.documents} WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<ExtractionDocument>();
}

export async function markDocumentProcessing(
  db: D1Database,
  document: ExtractionDocument,
  actor: AdminIdentity,
) {
  if (document.access_level === 'confidential')
    throw new DocumentValidationError(
      'confidential_documents_cannot_be_extracted',
    );
  if (document.assistant_status === 'processing')
    throw new DocumentValidationError('document_extraction_already_processing');
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE ${uniriseSchema.documents}
         SET assistant_status = 'processing', extraction_error = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, document.id),
    auditStatement(db, actor, 'document.extraction_started', document.id, {}),
  ]);
}

export async function completeDocumentExtraction(
  db: D1Database,
  document: ExtractionDocument,
  chunks: ExtractedDocumentChunk[],
  pageCount: number,
  characterCount: number,
  actor: AdminIdentity,
  options: { autoApprove?: boolean; excludedChunkCount?: number } = {},
) {
  const now = new Date().toISOString();
  const status = options.autoApprove ? 'approved' : 'review_required';
  const storedChunks = chunks.map((chunk, index) => ({
    ...chunk,
    id: crypto.randomUUID(),
    chunkNumber: index,
  }));
  const facts = extractDeterministicDocumentFacts(
    storedChunks.map((chunk) => ({
      content: chunk.content,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      subject: document.display_title,
    })),
  );
  const factStatus = options.autoApprove ? 'approved' : 'pending';
  const statements = [
    db
      .prepare(
        `DELETE FROM ${uniriseSchema.documentFacts} WHERE document_id = ?`,
      )
      .bind(document.id),
    db
      .prepare(
        `DELETE FROM ${uniriseSchema.documentChunks} WHERE document_id = ?`,
      )
      .bind(document.id),
    ...storedChunks.map((chunk) =>
      db
        .prepare(
          `INSERT INTO ${uniriseSchema.documentChunks} (id, document_id, chunk_number, page_start, page_end, language, content, extraction_method, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'text', ?, ?, ?)`,
        )
        .bind(
          chunk.id,
          document.id,
          chunk.chunkNumber,
          chunk.pageStart,
          chunk.pageEnd,
          document.source_language,
          chunk.content,
          status,
          now,
          now,
        ),
    ),
    ...facts.map((fact) => {
      const matchingChunk = storedChunks.find(
        (chunk) =>
          chunk.pageStart === fact.sourcePageStart &&
          chunk.pageEnd === fact.sourcePageEnd &&
          chunk.content.includes(fact.sourceExcerpt.slice(0, 80)),
      );
      return db
        .prepare(
          `INSERT INTO ${uniriseSchema.documentFacts} (id, document_id, chunk_id, fact_type, subject, predicate, value, unit, source_language, source_page_start, source_page_end, source_locator, source_excerpt, confidence, extraction_origin, review_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'text', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          document.id,
          matchingChunk?.id ?? null,
          fact.factType,
          fact.subject,
          fact.predicate,
          fact.value,
          fact.unit,
          document.source_language,
          fact.sourcePageStart,
          fact.sourcePageEnd,
          `page ${fact.sourcePageStart}${fact.sourcePageEnd === fact.sourcePageStart ? '' : `-${fact.sourcePageEnd}`}`,
          fact.sourceExcerpt,
          0.99,
          factStatus,
          now,
          now,
        );
    }),
    db
      .prepare(
        `UPDATE ${uniriseSchema.documents}
         SET assistant_status = ?, extracted_at = ?, extraction_page_count = ?, extraction_characters = ?, extraction_error = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .bind(status, now, pageCount, characterCount, now, document.id),
    auditStatement(
      db,
      actor,
      options.autoApprove
        ? 'document.extraction_auto_approved'
        : 'document.extraction_completed',
      document.id,
      {
        pageCount,
        characterCount,
        chunkCount: chunks.length,
        factCount: facts.length,
        excludedChunkCount: options.excludedChunkCount ?? 0,
      },
    ),
  ];
  for (let start = 0; start < statements.length; start += 80) {
    await db.batch(statements.slice(start, start + 80));
  }
}

export async function excludeDocumentAfterSafetyScreening(
  db: D1Database,
  document: ExtractionDocument,
  pageCount: number,
  characterCount: number,
  excludedChunkCount: number,
  actor: AdminIdentity,
) {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `DELETE FROM ${uniriseSchema.documentChunks} WHERE document_id = ?`,
      )
      .bind(document.id),
    db
      .prepare(
        `UPDATE ${uniriseSchema.documents}
         SET assistant_status = 'excluded', extracted_at = ?, extraction_page_count = ?, extraction_characters = ?, extraction_error = 'safety_screening_excluded', updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, pageCount, characterCount, now, document.id),
    auditStatement(
      db,
      actor,
      'document.extraction_safety_excluded',
      document.id,
      {
        pageCount,
        characterCount,
        excludedChunkCount,
      },
    ),
  ]);
}

export async function failDocumentExtraction(
  db: D1Database,
  document: ExtractionDocument,
  actor: AdminIdentity,
  reason: string,
) {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE ${uniriseSchema.documents}
         SET assistant_status = 'failed', extraction_error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(reason.slice(0, 240), now, document.id),
    auditStatement(db, actor, 'document.extraction_failed', document.id, {
      reason: reason.slice(0, 240),
    }),
  ]);
}

export async function findDocumentStorageKey(db: D1Database, id: string) {
  if (typeof id !== 'string' || !id.trim())
    throw new DocumentValidationError('id is required');
  return db
    .prepare(
      `SELECT storage_key FROM ${uniriseSchema.documents} WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<{ storage_key: string }>();
}

export async function deleteDocument(
  db: D1Database,
  id: string,
  actor: AdminIdentity,
) {
  if (typeof id !== 'string' || !id.trim())
    throw new DocumentValidationError('id is required');
  const [removed] = await db.batch([
    db.prepare(`DELETE FROM ${uniriseSchema.documents} WHERE id = ?`).bind(id),
    auditStatement(db, actor, 'document.deleted', id, {}),
  ]);
  if (removed.meta.changes !== 1)
    throw new DocumentValidationError('document not found');
}
