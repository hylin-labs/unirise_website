CREATE TABLE public_content (
  id TEXT PRIMARY KEY CHECK (id IN ('home', 'catalog', 'contact', 'inquiry', 'chrome')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  source_version INTEGER NOT NULL DEFAULT 1 CHECK (source_version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE content_translations (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('news', 'download', 'knowledge', 'public_content')),
  resource_id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale = 'en'),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL CHECK (status IN ('draft', 'needs_review', 'published')),
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  origin TEXT NOT NULL CHECK (origin IN ('ai', 'human')),
  outdated INTEGER NOT NULL DEFAULT 0 CHECK (outdated IN (0, 1)),
  failure_reason TEXT,
  reviewed_by TEXT REFERENCES admin_users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  translated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (resource_type, resource_id, locale)
);
CREATE INDEX content_translations_source_status_idx ON content_translations (resource_type, resource_id, source_version, status);
CREATE INDEX content_translations_review_idx ON content_translations (locale, outdated, status);

CREATE TABLE translation_jobs (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  creation_token TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale = 'en'),
  requested_by TEXT NOT NULL REFERENCES admin_users(id),
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'completed', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX translation_jobs_state_idx ON translation_jobs (state, created_at);

CREATE TABLE translation_job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES translation_jobs(id),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('news', 'download', 'knowledge', 'public_content')),
  resource_id TEXT NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  source_payload_json TEXT NOT NULL CHECK (json_valid(source_payload_json)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  claim_token TEXT,
  lease_expires_at TEXT,
  failure_reason TEXT,
  attempt_history_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(attempt_history_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (job_id, resource_type, resource_id, source_version)
);
CREATE INDEX translation_job_items_state_idx ON translation_job_items (job_id, state, lease_expires_at);
CREATE INDEX translation_job_items_source_idx ON translation_job_items (resource_type, resource_id, source_version);

ALTER TABLE managed_news ADD COLUMN source_version INTEGER NOT NULL DEFAULT 1 CHECK (source_version > 0);
ALTER TABLE managed_downloads ADD COLUMN source_version INTEGER NOT NULL DEFAULT 1 CHECK (source_version > 0);
ALTER TABLE chat_knowledge ADD COLUMN source_version INTEGER NOT NULL DEFAULT 1 CHECK (source_version > 0);
ALTER TABLE site_events ADD COLUMN locale TEXT NOT NULL DEFAULT 'zh-TW' CHECK (locale IN ('zh-TW', 'en'));
ALTER TABLE chat_question_log ADD COLUMN locale TEXT NOT NULL DEFAULT 'zh-TW' CHECK (locale IN ('zh-TW', 'en'));
ALTER TABLE chat_leads ADD COLUMN locale TEXT NOT NULL DEFAULT 'zh-TW' CHECK (locale IN ('zh-TW', 'en'));
CREATE INDEX site_events_date_locale_idx ON site_events (occurred_at DESC, locale, name);
CREATE INDEX chat_question_log_date_locale_idx ON chat_question_log (created_at DESC, locale, outcome);
CREATE INDEX chat_leads_date_locale_idx ON chat_leads (created_at DESC, locale, status);

-- Existing Chinese save operations participate in source tracking.
CREATE TRIGGER managed_news_version AFTER UPDATE OF legacy_id, title, lead, image_url, highlights_json, video_url ON managed_news
WHEN NEW.source_version = OLD.source_version AND (NEW.legacy_id IS NOT OLD.legacy_id OR NEW.title IS NOT OLD.title OR NEW.lead IS NOT OLD.lead OR NEW.image_url IS NOT OLD.image_url OR NEW.highlights_json IS NOT OLD.highlights_json OR NEW.video_url IS NOT OLD.video_url)
BEGIN
  UPDATE managed_news SET source_version = OLD.source_version + 1 WHERE id = NEW.id;
END;
CREATE TRIGGER managed_news_invalidate_translation AFTER UPDATE OF source_version ON managed_news
WHEN NEW.source_version <> OLD.source_version
BEGIN
  UPDATE content_translations
  SET outdated = 1, status = CASE WHEN status = 'draft' THEN 'draft' ELSE 'needs_review' END,
      reviewed_by = NULL, reviewed_at = NULL, updated_at = CURRENT_TIMESTAMP
  WHERE resource_type = 'news' AND resource_id = NEW.id AND source_version <> NEW.source_version;
END;

-- Existing Chinese save operations participate in source tracking.
CREATE TRIGGER managed_downloads_version AFTER UPDATE OF legacy_id, title ON managed_downloads
WHEN NEW.source_version = OLD.source_version AND (NEW.legacy_id IS NOT OLD.legacy_id OR NEW.title IS NOT OLD.title)
BEGIN
  UPDATE managed_downloads SET source_version = OLD.source_version + 1 WHERE id = NEW.id;
END;
CREATE TRIGGER managed_downloads_invalidate_translation AFTER UPDATE OF source_version ON managed_downloads
WHEN NEW.source_version <> OLD.source_version
BEGIN
  UPDATE content_translations
  SET outdated = 1, status = CASE WHEN status = 'draft' THEN 'draft' ELSE 'needs_review' END,
      reviewed_by = NULL, reviewed_at = NULL, updated_at = CURRENT_TIMESTAMP
  WHERE resource_type = 'download' AND resource_id = NEW.id AND source_version <> NEW.source_version;
END;

-- Existing Chinese save operations participate in source tracking.
CREATE TRIGGER chat_knowledge_version AFTER UPDATE OF title, href, body, tags_json ON chat_knowledge
WHEN NEW.source_version = OLD.source_version AND (NEW.title IS NOT OLD.title OR NEW.href IS NOT OLD.href OR NEW.body IS NOT OLD.body OR NEW.tags_json IS NOT OLD.tags_json)
BEGIN
  UPDATE chat_knowledge SET source_version = OLD.source_version + 1 WHERE id = NEW.id;
END;
CREATE TRIGGER chat_knowledge_invalidate_translation AFTER UPDATE OF source_version ON chat_knowledge
WHEN NEW.source_version <> OLD.source_version
BEGIN
  UPDATE content_translations
  SET outdated = 1, status = CASE WHEN status = 'draft' THEN 'draft' ELSE 'needs_review' END,
      reviewed_by = NULL, reviewed_at = NULL, updated_at = CURRENT_TIMESTAMP
  WHERE resource_type = 'knowledge' AND resource_id = NEW.id AND source_version <> NEW.source_version;
END;

-- Existing Chinese save operations participate in source tracking.
CREATE TRIGGER public_content_version AFTER UPDATE OF payload_json ON public_content
WHEN NEW.source_version = OLD.source_version AND (NEW.payload_json IS NOT OLD.payload_json)
BEGIN
  UPDATE public_content SET source_version = OLD.source_version + 1 WHERE id = NEW.id;
END;
CREATE TRIGGER public_content_invalidate_translation AFTER UPDATE OF source_version ON public_content
WHEN NEW.source_version <> OLD.source_version
BEGIN
  UPDATE content_translations
  SET outdated = 1, status = CASE WHEN status = 'draft' THEN 'draft' ELSE 'needs_review' END,
      reviewed_by = NULL, reviewed_at = NULL, updated_at = CURRENT_TIMESTAMP
  WHERE resource_type = 'public_content' AND resource_id = NEW.id AND source_version <> NEW.source_version;
END;

