import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sessionIsSuper } from "@/lib/tenant";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Super-admin only: list every tenant (election room) so a platform owner can
// see them all and open any one to experience its look & feel. Super-admins are
// already in every tenant's admin list, so the room/admin links just work.
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!s || !(await sessionIsSuper(s))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenants = await db.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { election: { select: { name: true, type: true, status: true, subscription: { select: { freeSeats: true, paidSeats: true } } } } },
  });
  const items = tenants.map((t) => ({
    slug: t.slug,
    name: t.name,
    contactEmail: t.contactEmail,
    electionName: t.election?.name || t.name,
    type: t.election?.type || null,
    status: t.election?.status || null,
    seats: t.election?.subscription ? (t.election.subscription.freeSeats + t.election.subscription.paidSeats) : null,
    createdAt: t.createdAt,
  }));
  return NextResponse.json({ tenants: items });
}
