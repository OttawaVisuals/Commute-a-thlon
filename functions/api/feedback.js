// Cloudflare Pages Function — POST /api/feedback
// Requires a D1 database bound as DB (configured in wrangler.toml).
// Schema: d1/schema.sql.

const MAX_MESSAGE_LEN = 2000;
const MAX_NAME_LEN = 100;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const message = (body.message || "").toString().trim();
  const name = (body.name || "").toString().trim();

  if (!message) {
    return json({ success: false, error: "Message is required" }, 400);
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return json({ success: false, error: "Message too long" }, 400);
  }
  if (name.length > MAX_NAME_LEN) {
    return json({ success: false, error: "Name too long" }, 400);
  }

  try {
    await env.DB
      .prepare("INSERT INTO feedback (name, message) VALUES (?, ?)")
      .bind(name || null, message)
      .run();
  } catch (err) {
    return json({ success: false, error: "Database error: " + err.message }, 500);
  }

  return json({ success: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
