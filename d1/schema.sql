-- Feedback table for the Commute-a-thlon feedback form.
-- Run once against the D1 database bound as FEEDBACK_DB:
--   wrangler d1 execute commute-a-thlon-feedback --remote --file=d1/schema.sql
-- (or paste into the Cloudflare dashboard's D1 "Console" tab)

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT,
  message TEXT NOT NULL
);
