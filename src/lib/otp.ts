// Simple in-memory OTP store with expiry. Fine for a single-instance situation
// room; move to Redis/DB if you scale horizontally.
type Entry = { code: string; expires: number; tries: number };
const g = globalThis as unknown as { psrOtp?: Map<string, Entry> };
const store = g.psrOtp ?? new Map<string, Entry>();
if (process.env.NODE_ENV !== "production") g.psrOtp = store;

export function setOtp(phone: string, code: string, ttlMs = 5 * 60_000) {
  store.set(phone, { code, expires: Date.now() + ttlMs, tries: 0 });
}

export function checkOtp(phone: string, code: string): boolean {
  const e = store.get(phone);
  if (!e) return false;
  if (Date.now() > e.expires || e.tries >= 5) {
    store.delete(phone);
    return false;
  }
  e.tries++;
  const ok = e.code === code;
  if (ok) store.delete(phone);
  return ok;
}
