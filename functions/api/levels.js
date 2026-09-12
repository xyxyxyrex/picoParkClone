import "../../src/level-data.js";

const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const digest = (text) =>
  crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
export async function onRequest(context) {
  const { request, env } = context;
  if (!env.LEVELS_DB)
    return json({ error: "Publishing storage is not configured." }, 503);
  try {
    if (request.method === "GET") {
      const row = await env.LEVELS_DB.prepare(
        "SELECT revision, payload FROM campaigns WHERE id = 1",
      ).first();
      return json({
        revision: row?.revision || null,
        campaign: row ? JSON.parse(row.payload) : null,
      });
    }
    if (request.method !== "PUT")
      return json({ error: "Method not allowed." }, 405);
    if (request.headers.get("Origin") !== new URL(request.url).origin)
      return json({ error: "Publish from the level editor." }, 403);
    if (!env.ADMIN_PASSWORD)
      return json({ error: "Admin password is not configured." }, 503);
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    const ipHash = [...new Uint8Array(await digest(ip))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const now = Date.now();
    const attempt = await env.LEVELS_DB.prepare(
      "INSERT INTO login_attempts (ip_hash, attempts, reset_at) VALUES (?, 1, ?) ON CONFLICT(ip_hash) DO UPDATE SET attempts = CASE WHEN reset_at < ? THEN 1 ELSE attempts + 1 END, reset_at = CASE WHEN reset_at < ? THEN ? ELSE reset_at END RETURNING attempts",
    )
      .bind(ipHash, now + 600000, now, now, now + 600000)
      .first();
    if (attempt.attempts > 10)
      return json(
        { error: "Too many attempts. Try again in ten minutes." },
        429,
      );
    const supplied = request.headers.get("Authorization") || "";
    const [a, b] = await Promise.all([
      digest(supplied),
      digest(`Bearer ${env.ADMIN_PASSWORD}`),
    ]);
    if (!crypto.subtle.timingSafeEqual(a, b))
      return json({ error: "Incorrect admin password." }, 401);
    if (!request.headers.get("Content-Type")?.includes("application/json"))
      return json({ error: "Send a JSON campaign." }, 415);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Campaign missing." }, 400);
    let bytes = 0;
    const chunks = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) {
        await reader.cancel();
        return json({ error: "Campaign exceeds 2 MB." }, 413);
      }
      chunks.push(value);
    }
    const all = new Uint8Array(bytes);
    let offset = 0;
    for (const c of chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(all));
      globalThis.ParkData.validate(body.campaign, true);
    } catch (e) {
      return json({ error: e.message }, 400);
    }
    const revision = crypto.randomUUID(),
      updated = new Date().toISOString();
    // Compare-and-swap in one SQL statement prevents concurrent publishers overwriting each other.
    const result =
      body.revision == null
        ? await env.LEVELS_DB.prepare(
            "INSERT OR IGNORE INTO campaigns (id, revision, payload, updated_at) VALUES (1, ?, ?, ?)",
          )
            .bind(revision, JSON.stringify(body.campaign), updated)
            .run()
        : await env.LEVELS_DB.prepare(
            "UPDATE campaigns SET revision = ?, payload = ?, updated_at = ? WHERE id = 1 AND revision = ?",
          )
            .bind(
              revision,
              JSON.stringify(body.campaign),
              updated,
              body.revision,
            )
            .run();
    if (!result.meta.changes) {
      const latest = await env.LEVELS_DB.prepare(
        "SELECT revision FROM campaigns WHERE id = 1",
      ).first();
      return json(
        {
          error:
            "Live levels changed since you opened the editor. Export your draft and reload to review the latest campaign before publishing.",
          revision: latest?.revision || null,
        },
        409,
      );
    }
    await env.LEVELS_DB.prepare(
      "DELETE FROM login_attempts WHERE ip_hash = ? OR reset_at < ?",
    )
      .bind(ipHash, now)
      .run();
    return json({ revision, updated });
  } catch (e) {
    console.error("level_api_failure", e.message);
    return json(
      {
        error:
          "Level storage is temporarily unavailable. Your local draft is safe.",
      },
      503,
    );
  }
}
