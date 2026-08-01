-- Commute-a-thlon — full D1 schema.
-- Run once against the D1 database bound as FEEDBACK_DB:
--   wrangler d1 execute commute-a-thlon-feedback --remote --file=d1/schema.sql
-- (or paste each statement into the Cloudflare dashboard D1 "Console" tab —
--  paste ONE statement at a time; the console rejects leading comments and
--  multi-statement blocks with "Requests without any query are not supported".)
--
-- All statements use IF NOT EXISTS, so re-running is safe.

-- ── participants ────────────────────────────────────────────────────────────
-- One row per person, keyed by email (email-as-identity login). usual_commute_mode
-- is the baseline the challenge builds on: drive | transit | walk | bike | run.
CREATE TABLE IF NOT EXISTS participants (
  email              TEXT PRIMARY KEY,
  display_name       TEXT,
  team               TEXT,
  usual_commute_mode TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── submissions ─────────────────────────────────────────────────────────────
-- One row per logged commute effort. Mirrors the Apps Script `Submissions` sheet.
CREATE TABLE IF NOT EXISTS submissions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  email                TEXT NOT NULL,
  display_name         TEXT,
  team                 TEXT,
  usual_commute_mode   TEXT,
  target_format        TEXT,
  target_distance_km   REAL,
  target_swim_km       REAL,
  target_bike_km       REAL,
  target_run_km        REAL,
  drawn_swim_km        REAL,
  drawn_bike_km        REAL,
  drawn_run_km         REAL,
  transition_minutes   REAL,
  total_distance_km    REAL,
  total_active_minutes REAL,
  total_elapsed_minutes REAL,
  total_met_minutes    REAL,
  fun_score            REAL,
  originality_score    REAL,
  completion_percent   REAL,
  activity_count       INTEGER,
  notes                TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_submissions_email ON submissions(email);

-- ── activities ──────────────────────────────────────────────────────────────
-- One row per activity leg within a submission. Mirrors the `Activities` sheet.
CREATE TABLE IF NOT EXISTS activities (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id      INTEGER NOT NULL,
  category           TEXT,
  activity_id        TEXT,
  activity_name      TEXT,
  distance           REAL,
  distance_unit      TEXT,
  time_minutes       REAL,
  met                REAL,
  met_minutes        REAL,
  fun_factor         REAL,
  originality_factor REAL,
  calculated_speed   REAL,
  season             TEXT
);
CREATE INDEX IF NOT EXISTS idx_activities_submission ON activities(submission_id);

-- ── ratings ─────────────────────────────────────────────────────────────────
-- Community rankings: one vote per person per activity (re-voting upserts).
-- fun / originality / difficulty each on a 1-5 scale.
CREATE TABLE IF NOT EXISTS ratings (
  email       TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  fun         INTEGER,
  originality INTEGER,
  difficulty  INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, activity_id)
);
CREATE INDEX IF NOT EXISTS idx_ratings_activity ON ratings(activity_id);

-- ── feedback ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name       TEXT,
  message    TEXT NOT NULL
);
