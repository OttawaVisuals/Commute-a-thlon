// Cloudflare Pages Function — POST /api/me  { email }
// Email-as-identity lookup: returns a participant's profile, aggregate stats,
// and their full submission history. No password — the email IS the key.
// POST (not GET) so the email travels in the request body, never in the URL /
// server logs; per-IP rate-limited so the endpoint can't be probed at scale.
// Requires a D1 database bound as DB (configured in wrangler.toml).

import { rateLimit, tooMany } from "./_lib.js";

export async function onRequestPost({ request, env }) {
  const rl = await rateLimit(env, request, { endpoint: "me", limit: 40, windowSec: 600 });
  if (!rl.ok) return tooMany(rl.retryAfter);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }
  const email = (body.email || "").toString().trim().toLowerCase();
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
      `SELECT id, created_at, activity_date, target_format, total_distance_km, total_met_minutes,
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
