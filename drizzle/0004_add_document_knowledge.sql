CREATE TABLE knowledge_documents (
  id TEXT PRIMARY KEY,
  original_filename TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  display_title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  source_language TEXT NOT NULL CHECK (source_language IN ('zh-TW', 'en', 'mixed')),
  access_level TEXT NOT NULL CHECK (access_level IN ('public', 'internal', 'confidential')),
  assistant_status TEXT NOT NULL DEFAULT 'pending' CHECK (assistant_status IN ('pending', 'processing', 'review_required', 'approved', 'excluded', 'failed')),
  mime_type TEXT NOT NULL CHECK (mime_type = 'application/pdf'),
  file_size INTEGER NOT NULL CHECK (file_size >= 0),
  r2_etag TEXT,
  uploaded_by TEXT NOT NULL REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  extracted_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES admin_users(id)
);

CREATE INDEX knowledge_documents_access_status_updated_idx
ON knowledge_documents (access_level, assistant_status, updated_at DESC);

CREATE INDEX knowledge_documents_uploader_created_idx
ON knowledge_documents (uploaded_by, created_at DESC);

CREATE TABLE knowledge_document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_number INTEGER NOT NULL CHECK (chunk_number >= 0),
  page_start INTEGER NOT NULL CHECK (page_start > 0),
  page_end INTEGER NOT NULL CHECK (page_end >= page_start),
  language TEXT NOT NULL CHECK (language IN ('zh-TW', 'en', 'mixed')),
  content TEXT NOT NULL,
  extraction_method TEXT NOT NULL CHECK (extraction_method IN ('text', 'ocr', 'vision')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'review_required', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (document_id, chunk_number)
);

CREATE INDEX knowledge_document_chunks_document_status_idx
ON knowledge_document_chunks (document_id, status, chunk_number);
