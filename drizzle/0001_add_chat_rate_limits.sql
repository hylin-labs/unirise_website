CREATE TABLE site_chat_rate_limits (
  bucket TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, visitor_hash)
);
