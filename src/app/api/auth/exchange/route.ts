import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withToken } from "@/lib/respond";
import type { Session } from "@/lib/auth";
import { verifyToramaAuthToken } from "@/lib/torama-auth";
import { resolveAdminByPhone, resolveAdminByEmail } from "@/lib/admin-phone";

export const runtime = "nodejs";

// POST { accessToken } — accept a Torama Auth access token (phone-OTP or Google
// login done at auth.torama.money for app "psr"), verify it via JWKS, resolve
// the phone/email to a PSR admin, and issue the same PSR session the local login
// would. Auth handles identity; PSR keeps authorization (election scope + role).
export async function POST(req: NextRequest) {
  const { accessToken } = await req.json().catch(() => ({}));
  if (!accessToken) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const id = await verifyToramaAuthToken(String(accessToken));
  if (!id) return NextResponse.json({ error: "Invalid or expired sign-in. Please try again." }, { status: 401 });

  // Resolve to a PSR admin by phone first, then email.
  const match =
    (id.phone ? await resolveAdminByPhone(id.phone) : null) ??
    (id.email ? await resolveAdminByEmail(id.email) : null);
  if (!match) {
    return NextResponse.json({ error: "This account isn't registered for admin access." }, { status: 403 });
  }

  const pinned = match.isSuper ? null : match.electionId;
  const user = await db.user.upsert({
    where: { email: match.email },
    update: { ...(pinned ? { electionId: pinned } : {}) },
    create: { email: match.email, name: match.name || match.email, role: "ADMIN", electionId: pinned },
  });

  const session: Session = {
    sub: user.id,
    kind: "user",
    name: user.name,
    role: user.role,
    scope: "NATIONAL",
    electionId: user.electionId,
    tv: user.tokenVersion,
  };
  return withToken(session);
}
