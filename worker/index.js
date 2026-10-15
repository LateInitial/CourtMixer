// CourtMixer - Cloudflare Worker (spec §16). Serves the static app (assets binding) and the
// cloud-sync API under /api/*. Identity is a sync code the client generates; the server only ever
// sees it in the Authorization header and stores SHA-256(SYNC_PEPPER + code), never the code.

const API_VERSION = 1;
const MAX_DOC = 256 * 1024;        // compressed document, bytes
const MAX_BODY = 300 * 1024;       // whole request body, bytes
const MAX_DOCS = 30;               // documents per account
const MAX_WRITES_PER_DAY = 500;    // per account, per UTC day
const DOC_KEY = /^(social|comp:[A-Za-z0-9-]{1,64})$/;
const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{20}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (e) {
      return json({ error: "server_error" }, 500);
    }
  }
};

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }, extra || {})
  });
}

// Upper-case, drop spaces and dashes, and read the easily confused letters as digits.
export function normaliseCode(raw) {
  return String(raw || "").toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

async function accountId(code, pepper) {
  const bytes = new TextEncoder().encode(pepper + code);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function today() { return new Date().toISOString().slice(0, 10); }

async function api(request, env, url) {
  // Same origin only: a browser sends Origin on cross-site requests; those are refused.
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return json({ error: "forbidden" }, 403);
  // A conservative per-IP limit where the rate-limit binding exists (§16.7).
  if (env.API_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const { success } = await env.API_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "rate_limited" }, 429);
  }

  const path = url.pathname;
  const method = request.method;
  if (path === "/api/health" && method === "GET") return json({ ok: true, version: API_VERSION });

  if (!env.DB || !env.SYNC_PEPPER) return json({ error: "not_configured" }, 503);
  const auth = request.headers.get("Authorization") || "";
  const code = normaliseCode(auth.replace(/^Bearer\s+/i, ""));
  if (!/^Bearer\s+/i.test(auth) || !CROCKFORD.test(code)) return json({ error: "unauthorized" }, 401);
  const acct = await accountId(code, env.SYNC_PEPPER);

  if (path === "/api/docs" && method === "GET") {
    const rs = await env.DB.prepare("SELECT doc_key, version, updated_at, size FROM docs WHERE account_id = ?1 ORDER BY doc_key").bind(acct).all();
    return json((rs.results || []).map(r => ({ docKey: r.doc_key, version: r.version, updatedAt: r.updated_at, size: r.size })));
  }
  if (path === "/api/account" && method === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM docs WHERE account_id = ?1").bind(acct),
      env.DB.prepare("DELETE FROM usage WHERE account_id = ?1").bind(acct)
    ]);
    return json({ ok: true });
  }

  const m = /^\/api\/docs\/([^/]+)$/.exec(path);
  if (!m) return json({ error: "not_found" }, 404);
  let docKey;
  try { docKey = decodeURIComponent(m[1]); } catch (e) { return json({ error: "bad_request" }, 400); }
  if (!DOC_KEY.test(docKey)) return json({ error: "bad_request" }, 400);

  if (method === "GET") {
    const r = await env.DB.prepare("SELECT version, updated_at, data FROM docs WHERE account_id = ?1 AND doc_key = ?2").bind(acct, docKey).first();
    if (!r) return json({ error: "not_found" }, 404);
    return json({ docKey, version: r.version, updatedAt: r.updated_at, data: r.data });
  }
  if (method === "DELETE") {
    // ?baseVersion=n: delete only the version the device last saw; a newer one comes back as 409
    const bv = url.searchParams.get("baseVersion");
    if (bv === null || !/^\d{1,9}$/.test(bv)) return json({ error: "bad_request" }, 400);
    const res = await env.DB.prepare("DELETE FROM docs WHERE account_id = ?1 AND doc_key = ?2 AND version = ?3").bind(acct, docKey, Number(bv)).run();
    if (res.meta && res.meta.changes === 1) return json({ ok: true });
    const cur = await env.DB.prepare("SELECT version, updated_at, data FROM docs WHERE account_id = ?1 AND doc_key = ?2").bind(acct, docKey).first();
    if (!cur) return json({ ok: true });   // already gone
    return json({ error: "conflict", version: cur.version, updatedAt: cur.updated_at, data: cur.data }, 409);
  }
  if (method !== "PUT") return json({ error: "method_not_allowed" }, 405);

  // --- PUT: optimistic versioning
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX_BODY) return json({ error: "too_large" }, 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY) return json({ error: "too_large" }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: "bad_request" }, 400); }
  if (!body || typeof body.data !== "string" || !Number.isInteger(body.baseVersion) || body.baseVersion < 0) return json({ error: "bad_request" }, 400);
  const size = new TextEncoder().encode(body.data).length;
  if (size > MAX_DOC) return json({ error: "too_large" }, 413);

  // the day's write is counted first, in one statement, so parallel requests can't pass the cap
  const day = today();
  const counted = await env.DB.prepare("INSERT INTO usage (account_id, day, writes) VALUES (?1, ?2, 1) ON CONFLICT (account_id, day) DO UPDATE SET writes = writes + 1 WHERE writes < ?3")
    .bind(acct, day, MAX_WRITES_PER_DAY).run();
  if (!counted.meta || counted.meta.changes !== 1) return json({ error: "daily_limit" }, 429);

  const now = Date.now();
  let res;
  if (body.baseVersion === 0) {
    // created only while the account is under its document cap (one statement, so parallel creates can't pass it)
    res = await env.DB.prepare("INSERT INTO docs (account_id, doc_key, data, version, updated_at, size) SELECT ?1, ?2, ?3, 1, ?4, ?5 WHERE (SELECT COUNT(*) FROM docs WHERE account_id = ?1) < ?6 ON CONFLICT (account_id, doc_key) DO NOTHING")
      .bind(acct, docKey, body.data, now, size, MAX_DOCS).run();
    if (!res.meta || res.meta.changes !== 1) {
      const exists = await env.DB.prepare("SELECT 1 AS x FROM docs WHERE account_id = ?1 AND doc_key = ?2").bind(acct, docKey).first();
      if (!exists) return json({ error: "too_many_docs" }, 413);
    }
  } else {
    res = await env.DB.prepare("UPDATE docs SET data = ?1, version = version + 1, updated_at = ?2, size = ?3 WHERE account_id = ?4 AND doc_key = ?5 AND version = ?6")
      .bind(body.data, now, size, acct, docKey, body.baseVersion).run();
  }
  if (!res.meta || res.meta.changes !== 1) {
    // someone else saved first: hand back the cloud copy so the device can decide
    const cur = await env.DB.prepare("SELECT version, updated_at, data FROM docs WHERE account_id = ?1 AND doc_key = ?2").bind(acct, docKey).first();
    if (!cur) return json({ error: "conflict", version: 0, updatedAt: 0, data: null }, 409);
    return json({ error: "conflict", version: cur.version, updatedAt: cur.updated_at, data: cur.data }, 409);
  }
  const row = await env.DB.prepare("SELECT version, updated_at FROM docs WHERE account_id = ?1 AND doc_key = ?2").bind(acct, docKey).first();
  return json({ version: row.version, updatedAt: row.updated_at });
}
