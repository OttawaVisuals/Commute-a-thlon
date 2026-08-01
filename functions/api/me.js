// Cloudflare Pages Function — GET /api/me?email=...
// Email-as-identity lookup: returns a participant's profile, aggregate stats,
// and their full submission history. No password — the email IS the key.
// Requires a D1 database bound as DB (configured in wrangler.toml).

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  if (!email) {
    return json({ success: false, error: "Email is required" }, 400);
  }

  try {
    const participant = await env.DB.prepare(
      `SELECT email, display_name, team, usual_commute_mode, created_at
       FROM participants WHERE email = ?`
    ).bind(email).first();

    if (!participant) {
      return json({ success: true, found: false, participant: null, stats: null, submissions: [] });
    }

    const stats = await env.DB.prepare(
      `SELECT
         COUNT(*)                                         AS submission_count,
         ROUND(COALESCE(SUM(total_distance_km), 0), 2)    AS total_distance_km,
         ROUND(COALESCE(SUM(total_met_minutes), 0), 1)    AS total_met_minutes,
         ROUND(COALESCE(SUM(total_active_minutes), 0), 1) AS total_active_minutes,
         ROUND(COALESCE(MAX(completion_percent), 0), 1)   AS best_completion_percent
       FROM submissions WHERE email = ?`
    ).bind(email).first();

    const { results: submissions } = await env.DB.prepare(
      `SELECT id, created_at, target_format, total_distance_km, total_met_minutes,
              completion_percent, activity_count, notes
       FROM submissions WHERE email = ? ORDER BY id DESC`
    ).bind(email).all();

    return json({ success: true, found: true, participant, stats, submissions: submissions || [] });
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
