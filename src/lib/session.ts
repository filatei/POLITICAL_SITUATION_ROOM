"use client";
import type { Session } from "./auth";

const TKEY = "psr_token";
const SKEY = "psr_session";
const UKEY = "psr_unit";

export function saveAuth(token: string, session: Session, unit?: unknown) {
  localStorage.setItem(TKEY, token);
  localStorage.setItem(SKEY, JSON.stringify(session));
  if (unit) localStorage.setItem(UKEY, JSON.stringify(unit));
}
export function getToken() { return typeof window === "undefined" ? null : localStorage.getItem(TKEY); }
export function getSessionLocal(): Session | null {
  if (typeof window === "undefined") return null;
  const s = localStorage.getItem(SKEY);
  return s ? (JSON.parse(s) as Session) : null;
}
export function getUnit<T = any>(): T | null {
  if (typeof window === "undefined") return null;
  const u = localStorage.getItem(UKEY);
  return u ? (JSON.parse(u) as T) : null;
}
export function clearAuth() { [TKEY, SKEY, UKEY].forEach((k) => localStorage.removeItem(k)); }

// Full sign-out: clear the httpOnly cookie on the server AND the local token.
// (clearAuth alone leaves the cookie, so /api/auth/me still sees you.)
export async function logout() {
  try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
  clearAuth();
}

export async function api(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(opts.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (opts.body && !(opts.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...opts, headers });
  return res;
}
