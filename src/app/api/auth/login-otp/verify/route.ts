import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withToken } from "@/lib/respond";
import type { Session } from "@/lib/auth";
import { resolveAdminByPhone } from "@/lib/admin-phone";
import { checkLoginOtp } from "@/lib/login-otp";

export const runtime = "nodejs";

// POST { phone, code } → verify the code, then issue the same admin session the
// Google flow would. Super-admins stay global; tenant admins are pinned to their
// election so they can never act on another tenant.
export async function POST(req: NextRequest) {
  const { phone, code } = await req.json().catch(() => ({}));
  if (!phone || !code) return NextResponse.json({ error: "Phone and code are required." }, { status: 400 });

  const match = await resolveAdminByPhone(String(phone));
  if (!match) return NextResponse.json({ error: "This number isn't registered for admin login." }, { status: 403 });

  const ok = await checkLoginOtp(String(phone), String(code).trim());
  if (!ok) return NextResponse.json({ error: "Invalid or expired code." }, { status: 401 });

  const pinned = match.isSuper ? null : match.electionId;
  const user = await db.user.upsert({
    where: { email: match.email },
    update: { ...(pinned ? { electionId: pinned } : {}) },
    create: { email: match.email, name: match.name || match.email, role: "ADMIN", electionId: pinned },
  });
  const session: Session = { sub: user.id, kind: "user", name: user.name, role: user.role, scope: "NATIONAL", electionId: user.electionId, tv: user.tokenVersion };
  return withToken(session);
}
