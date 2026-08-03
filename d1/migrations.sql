-- Commute-a-thlon — migrations for an EXISTING D1 database.
-- schema.sql already includes these columns for a fresh database; this file is
-- only for databases created before the columns existed.
--
-- SQLite has no "ADD COLUMN IF NOT EXISTS", so each ALTER errors if the column
-- is already there — that's harmless, it just means you've already run it.
-- Run each statement ONCE (paste individually into the D1 Console, or run the
-- whole file via wrangler).
--
--   npx wrangler d1 execute commute-a-thlon-feedback --remote --file=d1/migrations.sql
--
-- IMPORTANT: run this BEFORE (or together with) deploying the updated
-- functions/api/submit.js — that code writes to these new columns, so the
-- INSERT fails until they exist. The columns are additive and nullable, so
-- running the migration early does not affect the old code still in production.

-- 2026-08 — usual-commute leg distances + the date a commute was actually done.
ALTER TABLE participants ADD COLUMN usual_commute_km_1 REAL;
ALTER TABLE participants ADD COLUMN usual_commute_km_2 REAL;
ALTER TABLE submissions  ADD COLUMN usual_commute_km_1 REAL;
ALTER TABLE submissions  ADD COLUMN usual_commute_km_2 REAL;
ALTER TABLE submissions  ADD COLUMN activity_date TEXT;
