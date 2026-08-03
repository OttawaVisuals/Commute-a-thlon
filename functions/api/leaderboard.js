// Cloudflare Pages Function — GET /api/leaderboard
// Aggregates standings live from D1: one row per participant with their
// submission count and summed distance / MET-minutes across all submissions.
// Requires a D1 database bound as DB (configured in wrangler.toml).

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT
         p.display_name                              AS display_name,
         p.team                                      AS team,
         COUNT(s.id)                                 AS submission_count,
         ROUND(COALESCE(SUM(s.total_distance_km), 0), 2) AS total_distance_km,
         ROUND(COALESCE(SUM(s.total_met_minutes), 0), 1) AS total_met_minutes,
         ROUND(COALESCE(MAX(s.completion_percent), 0), 1) AS best_completion_percent
       FROM participants p
       LEFT JOIN submissions s ON s.email = p.email
       GROUP BY p.email
       ORDER BY total_distance_km DESC`
    ).all();

    return json({ success: true, rows: results || [] });
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
