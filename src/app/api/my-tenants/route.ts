import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sessionIsSuper } from "@/lib/tenant";

export const runtime = "nodejs";

// The rooms the signed-in staff user may administer. Super-admins get all
// tenants; everyone else gets the tenants whose adminEmails include their email.
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!s || s.kind !== "user") return NextResponse.json({ isSuper: false, tenants: [] });

  const isSuper = await sessionIsSuper(s);
  if (isSuper) {
    const all = await db.tenant.findMany({ orderBy: { createdAt: "desc" }, select: { slug: true, name: true } });
    return NextResponse.json({ isSuper: true, tenants: all });
  }

  const u = await db.user.findUnique({ where: { id: s.sub }, select: { email: true } });
  const email = u?.email?.toLowerCase();
  if (!email) return NextResponse.json({ isSuper: false, tenants: [] });
  const owned = await db.tenant.findMany({
    where: { adminEmails: { has: email } },
    orderBy: { createdAt: "desc" },
    select: { slug: true, name: true },
  });
  return NextResponse.json({ isSuper: false, tenants: owned });
}
