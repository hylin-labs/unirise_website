ALTER TABLE knowledge_documents ADD COLUMN source_hash TEXT;
ALTER TABLE knowledge_documents ADD COLUMN source_version TEXT;
ALTER TABLE knowledge_documents ADD COLUMN processing_pipeline_version TEXT;
ALTER TABLE knowledge_documents ADD COLUMN canonical_format TEXT;
ALTER TABLE knowledge_documents ADD COLUMN knowledge_summary_zh TEXT;
ALTER TABLE knowledge_documents ADD COLUMN knowledge_summary_en TEXT;
ALTER TABLE knowledge_documents ADD COLUMN public_knowledge_at TEXT;

CREATE TABLE knowledge_document_lineages (
  id TEXT PRIMARY KEY,
  canonical_title TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE knowledge_document_versions (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL REFERENCES knowledge_document_lineages(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL UNIQUE REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  version_label TEXT,
  source_hash TEXT,
  supersedes_version_id TEXT REFERENCES knowledge_document_versions(id),
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX knowledge_document_versions_lineage_current_idx
ON knowledge_document_versions (lineage_id, is_current, updated_at DESC);

CREATE TABLE knowledge_document_facts (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_id TEXT REFERENCES knowledge_document_chunks(id) ON DELETE SET NULL,
  fact_type TEXT NOT NULL CHECK (fact_type IN ('specification', 'operation', 'safety', 'maintenance', 'compatibility', 'contact')),
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  value TEXT NOT NULL,
  unit TEXT,
  source_language TEXT NOT NULL CHECK (source_language IN ('zh-TW', 'en', 'mixed')),
  source_page_start INTEGER NOT NULL CHECK (source_page_start > 0),
  source_page_end INTEGER NOT NULL CHECK (source_page_end >= source_page_start),
  source_locator TEXT,
  source_excerpt TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  extraction_origin TEXT NOT NULL CHECK (extraction_origin IN ('text', 'ocr', 'vision', 'model', 'manual')),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'excluded')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (document_id, subject, predicate, value, source_page_start, source_page_end)
);

CREATE INDEX knowledge_document_facts_document_review_idx
ON knowledge_document_facts (document_id, review_status, fact_type, source_page_start);

CREATE INDEX knowledge_document_facts_review_type_idx
ON knowledge_document_facts (review_status, fact_type, updated_at DESC);
