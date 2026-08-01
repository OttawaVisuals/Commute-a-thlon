// Cloudflare Pages Function — GET /api/ratings
// Aggregate community rankings: per-activity average fun / originality /
// difficulty and vote count. AVG() ignores NULLs, so a dimension only counts
// votes that rated it. The client maps activity_id -> name from activities.csv.
// Requires a D1 database bound as DB (configured in wrangler.toml).

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT
         activity_id,
         ROUND(AVG(fun), 1)         AS avg_fun,
         ROUND(AVG(originality), 1) AS avg_originality,
         ROUND(AVG(difficulty), 1)  AS avg_difficulty,
         COUNT(*)                   AS vote_count
       FROM ratings
       GROUP BY activity_id`
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
