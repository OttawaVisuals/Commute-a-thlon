-- Commute-a-thlon — manual cleanup snippets for the D1 database
-- (commute-a-thlon-feedback). Reference only: copy the block you need into the
-- Cloudflare dashboard D1 → Console, or run via wrangler.
--
-- IMPORTANT — run order:
--   A submission is spread across THREE tables — `submissions`, its child
--   `activities` (linked by submission_id), and the `participants` row (keyed by
--   email). There is NO foreign-key cascade, so always delete CHILD rows
--   (activities) BEFORE the parent (submissions), or you'll orphan them and the
--   leaderboard/awards will still count them.
--
--   In the D1 Console, paste and run ONE statement at a time (it rejects
--   multi-statement blocks). With `wrangler ... --file=d1/cleanup.sql` you'd run
--   the whole file — so keep only the statements you actually want uncommented.
--
--   `rate_limits` needs no cleanup — those rows expire and self-prune.


-- ── 1. Find the rows you want to remove ──────────────────────────────────────
-- Look up submission ids (newest first) so you can pick which to delete.
SELECT id, email, display_name, created_at, total_distance_km, notes
FROM submissions
ORDER BY id DESC;


-- ── 2. Delete specific test submissions by id ────────────────────────────────
-- Replace (12, 13, 14) with the ids from step 1. Children first, then parents.
DELETE FROM activities  WHERE submission_id IN (12, 13, 14);
DELETE FROM submissions WHERE id            IN (12, 13, 14);


-- ── 3. Wipe EVERYTHING for one test person (by email) ────────────────────────
-- Best if you use a distinct throwaway address (e.g. test@example.com) for all
-- test entries — then this is a clean one-shot removal. Run top to bottom.
DELETE FROM activities   WHERE submission_id IN (SELECT id FROM submissions WHERE email = 'test@example.com');
DELETE FROM submissions  WHERE email = 'test@example.com';
DELETE FROM ratings      WHERE email = 'test@example.com';
DELETE FROM participants WHERE email = 'test@example.com';


-- ── 4. Sanity checks after cleanup ───────────────────────────────────────────
-- Orphaned activities (should return no rows if run order was correct):
SELECT a.id, a.submission_id
FROM activities a
LEFT JOIN submissions s ON s.id = a.submission_id
WHERE s.id IS NULL;

-- Row counts per table:
SELECT 'participants' AS tbl, COUNT(*) AS n FROM participants
UNION ALL SELECT 'submissions', COUNT(*) FROM submissions
UNION ALL SELECT 'activities',  COUNT(*) FROM activities
UNION ALL SELECT 'ratings',     COUNT(*) FROM ratings
UNION ALL SELECT 'feedback',    COUNT(*) FROM feedback;
