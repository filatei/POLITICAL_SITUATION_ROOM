import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withToken } from "@/lib/respond";
import type { Session } from "@/lib/auth";
import { normalizeMsisdn } from "@/lib/sms";
import { authVerify } from "@/lib/torama-auth";
import { resolveAdminByPhone } from "@/lib/admin-phone";

export const runtime = "nodejs";

// POST { phone, code, deviceId } — verify the OTP via Torama Auth, then resolve
// the number to a PSR admin and issue the PSR session (Auth = identity, PSR =
// authorization / election scope). Same session the local login would issue.
export async function POST(req: NextRequest) {
  const { phone, code, deviceId } = await req.json().catch(() => ({}));
  const n = normalizeMsisdn(String(phone || ""));
  if (!n || !code || !deviceId) return NextResponse.json({ error: "Phone and code are required." }, { status: 400 });

  // Only admins may get a session — check first so a valid code for a non-admin
  // number still can't sign in.
  const match = await resolveAdminByPhone(n);
  if (!match) return NextResponse.json({ error: "This number isn't registered for admin login." }, { status: 403 });

  const v = await authVerify(n, String(code).trim(), String(deviceId));
  if (!v.ok) return NextResponse.json({ error: v.error || "Invalid or expired code." }, { status: 401 });

  const pinned = match.isSuper ? null : match.electionId;
  const user = await db.user.upsert({
    where: { email: match.email },
    // Super-admins are global — clear any stale election pin. Tenant admins pin
    // to their election.
    update: match.isSuper ? { electionId: null } : (pinned ? { electionId: pinned } : {}),
    create: { email: match.email, name: match.name || match.email, role: "ADMIN", electionId: pinned },
  });
  const session: Session = {
    sub: user.id, kind: "user", name: user.name, role: user.role,
    scope: "NATIONAL", electionId: user.electionId, tv: user.tokenVersion,
  };
  return withToken(session);
}
