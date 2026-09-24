CREATE TABLE site_line_contacts (
  id TEXT PRIMARY KEY,
  label_zh TEXT NOT NULL,
  label_en TEXT NOT NULL,
  line_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX site_line_contacts_public_idx
ON site_line_contacts (enabled, display_order, updated_at DESC);

INSERT INTO site_line_contacts (id, label_zh, label_en, line_url, enabled, display_order)
VALUES (
  'hungyu-test',
  'Hungyu（測試聯絡）',
  'Hungyu (test contact)',
  'https://line.me/ti/p/Rg3ax2MQJn',
  1,
  0
);
