// Shared helpers for the Pages Functions.
// The leading underscore keeps this file OUT of the /api/* route table — it is
// an importable module, not an endpoint.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Fixed-window per-IP rate limiter backed by the `rate_limits` D1 table.
// Bucket key = endpoint:ip:windowIndex; a counter is incremented per request
// and compared to `limit`. Keeps the whole thing in D1 so it needs no dashboard
// config or extra binding — in keeping with the app's "no build, no token" flow.
//
// Returns { ok, retryAfter }. Fails OPEN (ok:true) on any limiter error so a
// transient DB hiccup never blocks a legitimate submission.
export async function rateLimit(env, request, { endpoint, limit, windowSec }) {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";
  const nowSec = Math.floor(Date.now() / 1000);
  const windowIndex = Math.floor(nowSec / windowSec);
  const bucket = `${endpoint}:${ip}:${windowIndex}`;
  const expiresAt = (windowIndex + 1) * windowSec;

  try {
    const row = await env.DB.prepare(
      `INSERT INTO rate_limits (bucket, hits, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1
       RETURNING hits`
    ).bind(bucket, expiresAt).first();

    // Opportunistic cleanup so the table never grows unbounded (cheap; ~2%).
    if (Math.random() < 0.02) {
      await env.DB.prepare(`DELETE FROM rate_limits WHERE expires_at < ?`)
        .bind(nowSec).run();
    }

    const hits = Number(row && row.hits) || 1;
    return { ok: hits <= limit, retryAfter: expiresAt - nowSec };
  } catch {
    return { ok: true, retryAfter: 0 };
  }
}

export function tooMany(retryAfter) {
  return new Response(
    JSON.stringify({ success: false, error: "Too many requests — please slow down and try again shortly." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(1, retryAfter || 60)),
      },
    }
  );
}
