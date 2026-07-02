import { NextResponse } from "next/server";
import { AUTH_COOKIE, type Session, signSession } from "./auth";

export async function withToken(session: Session, extra: Record<string, unknown> = {}) {
  const token = await signSession(session);
  const res = NextResponse.json({ ok: true, token, session, ...extra });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — agents stay signed in through the election
  });
  return res;
}
