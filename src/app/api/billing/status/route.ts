import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { SEAT_PRICE_NAIRA } from "@/lib/billing";
import { paystackEnabled, squadEnabled } from "@/lib/payments";

export const runtime = "nodejs";

// Current seat balance for the election. Creates the subscription (10 free) lazily.
export async function getSeatStatus() {
  const election = await db.election.findFirst({ orderBy: { createdAt: "desc" } });
  if (!election) return null;
  let sub = await db.subscription.findUnique({ where: { electionId: election.id } });
  if (!sub) sub = await db.subscription.create({ data: { electionId: election.id } });
  const used = await db.agent.count({ where: { electionId: election.id } });
  const total = sub.freeSeats + sub.paidSeats;
  return {
    electionId: election.id, electionName: election.name,
    freeSeats: sub.freeSeats, paidSeats: sub.paidSeats, total, used,
    available: Math.max(0, total - used),
  };
}

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const status = await getSeatStatus();
  if (!status) return NextResponse.json({ error: "No election." }, { status: 404 });
  return NextResponse.json({ ...status, priceNaira: SEAT_PRICE_NAIRA, providers: { paystack: paystackEnabled, squad: squadEnabled } });
}
