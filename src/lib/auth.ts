import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export type Session = {
  sub: string;
  kind: "agent" | "user";
  name: string;
  role: "ADMIN" | "COORDINATOR" | "ANALYST" | "AGENT";
  scope?: "NATIONAL" | "STATE" | "LGA" | "WARD" | "PU";
  unitId?: string | null;
  electionId?: string | null;
  tv?: number; // token version — bumped on reset/suspend to revoke old JWTs
};

const secret = () => {
  const val = process.env.JWT_SECRET;
  // Never run production auth on the dev fallback — that would let anyone forge
  // tokens (including super-admin). Fail loudly instead.
  if (!val || val.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET is missing or too short — refusing to sign/verify tokens.");
    return new TextEncoder().encode(val || "dev-insecure-secret-please-set-JWT_SECRET");
  }
  return new TextEncoder().encode(val);
};

export async function signSession(s: Session, expires = "90d"): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret());
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

const COOKIE = "psr_token";

export async function getSession(req?: NextRequest): Promise<Session | null> {
  let token: string | undefined;
  if (req) {
    const h = req.headers.get("authorization");
    if (h?.startsWith("Bearer ")) token = h.slice(7);
    if (!token) token = req.cookies.get(COOKIE)?.value;
  } else {
    token = cookies().get(COOKIE)?.value;
  }
  if (!token) return null;
  return verifySession(token);
}

export function requireRole(s: Session | null, roles: Session["role"][]): boolean {
  return !!s && roles.includes(s.role);
}

export const AUTH_COOKIE = COOKIE;
