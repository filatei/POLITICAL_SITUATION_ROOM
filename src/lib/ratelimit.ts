// Shared, IP/key-scoped fixed-window rate limiter. Kept on globalThis so all
// routes share one store (not a per-module array). Single-instance only — swap
// for Redis if the app is ever scaled horizontally.
type Hit = { count: number; reset: number };
const g = globalThis as unknown as { psrRL?: Map<string, Hit> };
const store = g.psrRL ?? new Map<string, Hit>();
g.psrRL = store;

// Returns true if allowed, false if the caller has exceeded `limit` in `windowMs`.
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const h = store.get(key);
  if (!h || now > h.reset) { store.set(key, { count: 1, reset: now + windowMs }); return true; }
  if (h.count >= limit) return false;
  h.count += 1;
  return true;
}

// Best-effort client IP behind Cloudflare/Apache.
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}
