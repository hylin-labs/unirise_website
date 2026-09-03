CREATE TABLE site_visitors (
  visitor_hash TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL
);

CREATE TABLE site_visitor_days (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY (day, visitor_hash)
);

CREATE TABLE site_visitor_totals (
  metric TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

INSERT INTO site_visitor_totals (metric, value) VALUES ('total_visitors', 0);
