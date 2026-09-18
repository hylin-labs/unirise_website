import { uniriseSchema } from '../db/schema';
import type { AdminIdentity } from './admin-auth';

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

export type DocumentLanguage = (typeof documentLanguages)[number];
export type DocumentAccessLevel = (typeof documentAccessLevels)[number];
export type DocumentAssistantStatus =
  (typeof documentAssistantStatuses)[number];

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
  createdAt: string;
  updatedAt: string;
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
  created_at: string;
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
    createdAt: row.created_at,
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
      `SELECT id, original_filename, display_title, category, source_language, access_level, assistant_status, mime_type, file_size, created_at, updated_at
       FROM ${uniriseSchema.documents}
       ORDER BY updated_at DESC`,
    )
    .all<DocumentRow>();
  return rows.results.map(rowToDocument);
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
