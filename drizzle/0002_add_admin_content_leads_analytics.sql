CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_login_codes (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts_remaining INTEGER NOT NULL DEFAULT 5,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX admin_sessions_active_idx ON admin_sessions (token_hash, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT REFERENCES admin_users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE managed_news (
  id TEXT PRIMARY KEY,
  legacy_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  lead TEXT NOT NULL,
  image_url TEXT NOT NULL,
  highlights_json TEXT NOT NULL,
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE INDEX managed_news_published_idx ON managed_news (status, published_at DESC);

CREATE TABLE managed_downloads (
  id TEXT PRIMARY KEY,
  legacy_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE INDEX managed_downloads_published_idx ON managed_downloads (status, published_at DESC);

CREATE TABLE chat_knowledge (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  href TEXT NOT NULL,
  body TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE INDEX chat_knowledge_published_idx ON chat_knowledge (status, published_at DESC);

CREATE TABLE chat_leads (
  id TEXT PRIMARY KEY,
  request_type TEXT NOT NULL CHECK (request_type IN ('quote', 'specialist')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  topic TEXT,
  message TEXT NOT NULL,
  source_path TEXT NOT NULL,
  visitor_hash TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  email_delivered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX chat_leads_status_date_idx ON chat_leads (status, created_at DESC);

CREATE TABLE site_events (
  id TEXT PRIMARY KEY,
  visitor_hash TEXT,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX site_events_date_path_idx ON site_events (occurred_at DESC, path);

CREATE TABLE chat_question_log (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('answered', 'unanswered')),
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX chat_question_log_outcome_date_idx ON chat_question_log (outcome, created_at DESC);
