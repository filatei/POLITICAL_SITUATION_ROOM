import { createRemoteJWKSet, jwtVerify } from "jose";

// Verify a Torama Auth access token against its published JWKS. Used by the
// /api/auth/exchange route to accept a phone-OTP / Google login done by the
// central Auth service (auth.torama.money) and turn it into a PSR session.
//
//   AUTH_JWKS_URL   default https://auth.torama.money/.well-known/jwks.json
//   AUTH_APP_ID     the app id PSR is registered as in Auth (default "psr")

const JWKS_URL = process.env.AUTH_JWKS_URL || "https://auth.torama.money/.well-known/jwks.json";
const APP_ID = process.env.AUTH_APP_ID || "psr";

// Cache the remote key set across requests.
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

export type AuthIdentity = { sub: string; phone?: string; email?: string; roles: string[] };

export async function verifyToramaAuthToken(token: string): Promise<AuthIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: "torama-auth", audience: APP_ID });
    return {
      sub: String(payload.sub),
      phone: (payload["phone"] as string) || undefined,
      email: (payload["email"] as string) || undefined,
      roles: (payload["roles"] as string[]) || [],
    };
  } catch {
    return null;
  }
}

// Feature flag — only expose the Auth-backed login when configured.
export const toramaAuthEnabled = Boolean(process.env.NEXT_PUBLIC_AUTH_URL);

// ── Server-to-server proxy to Torama Auth ────────────────────────────────────
// PSR calls Auth from its own backend (not the browser) so Auth tokens never
// leave the server and there's no cross-origin/CORS surface.
const AUTH_BASE = (process.env.AUTH_URL || "https://auth.torama.money").replace(/\/$/, "");
const APP = process.env.AUTH_APP_ID || "psr";

export async function authStart(phone: string, deviceId: string): Promise<{ ok: boolean; step?: string; reason?: string; error?: string }> {
  try {
    const r = await fetch(`${AUTH_BASE}/v1/login/start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: APP, phone, deviceId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j?.error?.message || "Could not start sign-in." };
    return { ok: true, step: j?.data?.step, reason: j?.data?.reason };
  } catch { return { ok: false, error: "Auth service unreachable." }; }
}

// Verify the OTP with Auth. For app "psr" (no PIN) a valid code returns tokens,
// which is all PSR needs — it then resolves the phone to an admin itself.
export async function authVerify(phone: string, code: string, deviceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${AUTH_BASE}/v1/otp/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: APP, phone, code, deviceId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.data?.tokens) return { ok: false, error: j?.error?.message || "Invalid or expired code." };
    return { ok: true };
  } catch { return { ok: false, error: "Auth service unreachable." }; }
}
