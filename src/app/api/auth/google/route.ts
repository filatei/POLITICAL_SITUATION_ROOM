import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { db } from "@/lib/db";
import { withToken } from "@/lib/respond";
import type { Session } from "@/lib/auth";

export const runtime = "nodejs";
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function POST(req: NextRequest) {
  const { credential } = await req.json();
  if (!credential) return NextResponse.json({ error: "Missing credential." }, { status: 400 });
  let email: string | undefined, name: string | undefined, sub: string | undefined;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    email = p?.email;
    name = p?.name;
    sub = p?.sub;
  } catch {
    return NextResponse.json({ error: "Google verification failed." }, { status: 401 });
  }
  if (!email) return NextResponse.json({ error: "No email in Google token." }, { status: 401 });

  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return NextResponse.json({ error: "This Google account is not authorized." }, { status: 403 });
  if (!user.googleSub && sub) await db.user.update({ where: { id: user.id }, data: { googleSub: sub } });

  const session: Session = { sub: user.id, kind: "user", name: user.name, role: user.role, scope: "NATIONAL" };
  return withToken(session);
}
