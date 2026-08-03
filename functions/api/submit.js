// Cloudflare Pages Function — POST /api/submit
// Ports the Apps Script doPost: writes one `submissions` row + one `activities`
// row per logged activity, and upserts the `participants` row (keyed by email).
// Requires a D1 database bound as DB (configured in wrangler.toml).
// Schema: d1/schema.sql. Returns { success, submissionId } — a real, readable
// response (no more no-cors optimistic writes).

import { rateLimit, tooMany } from "./_lib.js";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v) => (v == null ? "" : String(v));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, num(v)));
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Per-leg sanity ceilings. The leaderboard is competitive, so the server does
// NOT trust the client's summary totals — it recomputes them from the activity
// legs, and clamps each leg to a physically plausible range first. This closes
// the trivial "POST totalDistanceKm: 999999" hole. It is not full anti-cheat
// (a determined user can still fabricate realistic-looking legs), but it makes
// gaming require plausible per-leg data rather than a one-line edit.
const MAX_LEG_DISTANCE = 500;   // km (or storeys) for a single logged leg
const MAX_LEG_MINUTES = 1440;   // 24h
const MAX_LEG_MET = 30;         // well above any compendium value
const MAX_FACTOR = 10;          // fun/originality are on a 1-10 scale
const MAX_ACTIVITIES = 50;      // legs per submission

export async function onRequestPost({ request, env }) {
  const rl = await rateLimit(env, request, { endpoint: "submit", limit: 20, windowSec: 600 });
  if (!rl.ok) return tooMany(rl.retryAfter);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const email = str(data.email).trim().toLowerCase();
  if (!email) {
    return json({ success: false, error: "Email is required" }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return json({ success: false, error: "That doesn't look like a valid email" }, 400);
  }

  const rawActivities = Array.isArray(data.activities) ? data.activities : [];
  if (!rawActivities.length) {
    return json({ success: false, error: "Log at least one activity before submitting" }, 400);
  }
  if (rawActivities.length > MAX_ACTIVITIES) {
    return json({ success: false, error: "Too many activities in one submission" }, 400);
  }

  // ── Recompute trusted values from the legs (never trust client summaries) ──
  const activities = rawActivities.map((a) => {
    const unit = str(a.distanceUnit) || "km";
    const distance = clamp(a.distance, 0, MAX_LEG_DISTANCE);
    const timeMinutes = clamp(a.timeMinutes, 0, MAX_LEG_MINUTES);
    const met = clamp(a.met, 0, MAX_LEG_MET);
    const funFactor = clamp(a.funFactor, 0, MAX_FACTOR);
    const originalityFactor = clamp(a.originalityFactor, 0, MAX_FACTOR);
    return {
      category: str(a.category),
      activityId: str(a.activityId),
      activityName: str(a.activityName),
      distance,
      distanceUnit: unit,
      timeMinutes,
      met,
      metMinutes: met * timeMinutes,               // derived, not trusted
      funFactor,
      originalityFactor,
      calculatedSpeed: clamp(a.calculatedSpeed, 0, 200),
      season: str(a.season),
      isKm: unit === "km",
    };
  });

  const totalDistanceKm = activities.reduce((s, a) => s + (a.isKm ? a.distance : 0), 0);
  const totalActiveMinutes = activities.reduce((s, a) => s + a.timeMinutes, 0);
  const totalMETMinutes = activities.reduce((s, a) => s + a.metMinutes, 0);
  const funScore = activities.reduce((s, a) => s + a.funFactor, 0) / activities.length;
  const originalityScore = activities.reduce((s, a) => s + a.originalityFactor, 0) / activities.length;
  const targetDistanceKm = clamp(data.targetDistanceKm, 0, 100000);
  const completionPercent = targetDistanceKm > 0 ? (totalDistanceKm / targetDistanceKm) * 100 : 0;

  const usualCommuteKm1 = clamp(data.usualCommuteKm1, 0, MAX_LEG_DISTANCE);
  const usualCommuteKm2 = clamp(data.usualCommuteKm2, 0, MAX_LEG_DISTANCE);
  // Accept only a plain YYYY-MM-DD; anything else falls back to NULL (the row's
  // created_at still records when it was logged).
  const activityDate = /^\d{4}-\d{2}-\d{2}$/.test(str(data.activityDate)) ? str(data.activityDate) : null;

  try {
    // 1) Insert the submission and capture its auto-increment id.
    const sub = await env.DB.prepare(
      `INSERT INTO submissions (
         email, display_name, team, usual_commute_mode, usual_commute_km_1, usual_commute_km_2, activity_date,
         target_format, target_distance_km, target_swim_km, target_bike_km, target_run_km,
         drawn_swim_km, drawn_bike_km, drawn_run_km, transition_minutes,
         total_distance_km, total_active_minutes, total_elapsed_minutes, total_met_minutes,
         fun_score, originality_score, completion_percent, activity_count, notes
       ) VALUES (?,?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?)`
    ).bind(
      email, str(data.displayName), str(data.team), str(data.usualCommuteMode), usualCommuteKm1, usualCommuteKm2, activityDate,
      str(data.targetFormat), targetDistanceKm, num(data.targetSwimKm), num(data.targetBikeKm), num(data.targetRunKm),
      num(data.drawnSwimKm), num(data.drawnBikeKm), num(data.drawnRunKm), num(data.transitionMinutes),
      totalDistanceKm, totalActiveMinutes, num(data.totalElapsedMinutes), totalMETMinutes,
      funScore, originalityScore, completionPercent, activities.length, str(data.notes)
    ).run();

    const submissionId = sub.meta.last_row_id;

    // 2) Insert each activity + upsert the participant, atomically in one batch.
    const insertActivity = env.DB.prepare(
      `INSERT INTO activities (
         submission_id, category, activity_id, activity_name,
         distance, distance_unit, time_minutes, met, met_minutes,
         fun_factor, originality_factor, calculated_speed, season
       ) VALUES (?,?,?,?, ?,?,?,?,?, ?,?,?,?)`
    );

    const batch = activities.map((a) => insertActivity.bind(
      submissionId, a.category, a.activityId, a.activityName,
      a.distance, a.distanceUnit, a.timeMinutes, a.met, a.metMinutes,
      a.funFactor, a.originalityFactor, a.calculatedSpeed, a.season
    ));

    batch.push(
      env.DB.prepare(
        `INSERT INTO participants (email, display_name, team, usual_commute_mode, usual_commute_km_1, usual_commute_km_2, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(email) DO UPDATE SET
           display_name       = excluded.display_name,
           team               = excluded.team,
           usual_commute_mode = excluded.usual_commute_mode,
           usual_commute_km_1 = excluded.usual_commute_km_1,
           usual_commute_km_2 = excluded.usual_commute_km_2,
           updated_at         = datetime('now')`
      ).bind(email, str(data.displayName), str(data.team), str(data.usualCommuteMode), usualCommuteKm1, usualCommuteKm2)
    );

    await env.DB.batch(batch);

    return json({ success: true, submissionId });
  } catch (err) {
    return json({ success: false, error: "Database error: " + err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
