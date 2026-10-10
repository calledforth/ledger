import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time check of "Authorization: Bearer <MCP_TOKEN>". The token is never logged. */
export function checkBearer(header: string | null, expected = process.env.MCP_TOKEN): boolean {
  if (!expected || expected.length < 16) return false;
  const m = header?.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  // Hash both sides so the comparison is fixed-length and timing-safe.
  return timingSafeEqual(digest(m[1].trim()), digest(expected));
}

export function unauthorized(reason: "missing" | "invalid" | "not_configured") {
  const desc = reason === "missing" ? "Bearer token required" : reason === "invalid" ? "Invalid bearer token" : "Server has no MCP_TOKEN configured";
  return new Response(JSON.stringify({ error: reason === "not_configured" ? "server_misconfigured" : "unauthorized", error_description: desc }), {
    status: reason === "not_configured" ? 500 : 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": `Bearer realm="ledger-mcp", error="${reason === "invalid" ? "invalid_token" : "invalid_request"}", error_description="${desc}"`,
    },
  });
}

// Light in-memory rate limit per client IP. Per function instance only; enough to blunt a runaway loop.
const WINDOW_MS = 60_000;
const LIMIT = Number(process.env.MCP_RATE_LIMIT_PER_MIN ?? 240);
const hits = new Map<string, { start: number; n: number }>();

export function rateLimited(ip: string, now = Date.now()): boolean {
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) {
    hits.set(ip, { start: now, n: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  h.n++;
  return h.n > LIMIT;
}
