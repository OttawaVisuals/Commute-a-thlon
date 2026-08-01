// Cloudflare Pages Function — POST /api/rate
// Community rating: one vote per person per activity, on a 1-10 scale for
// fun / originality / difficulty. Re-rating upserts (keyed by email+activity).
// A missing dimension preserves the previous value rather than wiping it.
// Requires a D1 database bound as DB (configured in wrangler.toml).

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const clamp10 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : null;
};

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const email = String(data.email || "").trim().toLowerCase();
  const activityId = String(data.activityId || "").trim();
  if (!EMAIL_RE.test(email)) {
    return json({ success: false, error: "A valid email is required to rate" }, 400);
  }
  if (!activityId) {
    return json({ success: false, error: "activityId is required" }, 400);
  }

  const fun = clamp10(data.fun);
  const originality = clamp10(data.originality);
  const difficulty = clamp10(data.difficulty);
  if (fun === null && originality === null && difficulty === null) {
    return json({ success: false, error: "Rate at least one dimension" }, 400);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO ratings (email, activity_id, fun, originality, difficulty, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(email, activity_id) DO UPDATE SET
         fun         = COALESCE(excluded.fun, ratings.fun),
         originality = COALESCE(excluded.originality, ratings.originality),
         difficulty  = COALESCE(excluded.difficulty, ratings.difficulty),
         updated_at  = datetime('now')`
    ).bind(email, activityId, fun, originality, difficulty).run();

    return json({ success: true });
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
