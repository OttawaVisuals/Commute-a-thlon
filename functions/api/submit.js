// Cloudflare Pages Function — POST /api/submit
// Ports the Apps Script doPost: writes one `submissions` row + one `activities`
// row per logged activity, and upserts the `participants` row (keyed by email).
// Requires a D1 database bound as DB (configured in wrangler.toml).
// Schema: d1/schema.sql. Returns { success, submissionId } — a real, readable
// response (no more no-cors optimistic writes).

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v) => (v == null ? "" : String(v));
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function onRequestPost({ request, env }) {
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

  const activities = Array.isArray(data.activities) ? data.activities : [];
  if (!activities.length) {
    return json({ success: false, error: "Log at least one activity before submitting" }, 400);
  }

  try {
    // 1) Insert the submission and capture its auto-increment id.
    const sub = await env.DB.prepare(
      `INSERT INTO submissions (
         email, display_name, team, usual_commute_mode,
         target_format, target_distance_km, target_swim_km, target_bike_km, target_run_km,
         drawn_swim_km, drawn_bike_km, drawn_run_km, transition_minutes,
         total_distance_km, total_active_minutes, total_elapsed_minutes, total_met_minutes,
         fun_score, originality_score, completion_percent, activity_count, notes
       ) VALUES (?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?)`
    ).bind(
      email, str(data.displayName), str(data.team), str(data.usualCommuteMode),
      str(data.targetFormat), num(data.targetDistanceKm), num(data.targetSwimKm), num(data.targetBikeKm), num(data.targetRunKm),
      num(data.drawnSwimKm), num(data.drawnBikeKm), num(data.drawnRunKm), num(data.transitionMinutes),
      num(data.totalDistanceKm), num(data.totalActiveMinutes), num(data.totalElapsedMinutes), num(data.totalMETMinutes),
      num(data.funScore), num(data.originalityScore), num(data.completionPercent), activities.length, str(data.notes)
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
      submissionId, str(a.category), str(a.activityId), str(a.activityName),
      num(a.distance), str(a.distanceUnit), num(a.timeMinutes), num(a.met), num(a.metMinutes),
      num(a.funFactor), num(a.originalityFactor), num(a.calculatedSpeed), str(a.season)
    ));

    batch.push(
      env.DB.prepare(
        `INSERT INTO participants (email, display_name, team, usual_commute_mode, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(email) DO UPDATE SET
           display_name       = excluded.display_name,
           team               = excluded.team,
           usual_commute_mode = excluded.usual_commute_mode,
           updated_at         = datetime('now')`
      ).bind(email, str(data.displayName), str(data.team), str(data.usualCommuteMode))
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
