CREATE TABLE site_line_contacts_next (
  id TEXT PRIMARY KEY,
  label_zh TEXT NOT NULL,
  label_en TEXT NOT NULL,
  line_url TEXT,
  qr_image_key TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO site_line_contacts_next (
  id, label_zh, label_en, line_url, qr_image_key, enabled, display_order, created_at, updated_at
)
SELECT
  id, label_zh, label_en, line_url, qr_image_key, enabled, display_order, created_at, updated_at
FROM site_line_contacts;

DROP TABLE site_line_contacts;
ALTER TABLE site_line_contacts_next RENAME TO site_line_contacts;

CREATE INDEX site_line_contacts_public_idx
ON site_line_contacts (enabled, display_order, updated_at DESC);
