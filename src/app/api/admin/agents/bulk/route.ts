import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { inviteCode } from "@/lib/code";
import { seatStatus } from "@/lib/seats";

export const runtime = "nodejs";

// Generate `perUnit` fresh codes for EVERY polling unit in an LGA. This is
// additive: running it again on the same LGA mints another set of distinct
// codes (units aren't skipped just because they already have codes), so an
// admin can top up as more field agents come on board.
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { lgaId, perUnit } = await req.json();
  if (!lgaId) return NextResponse.json({ error: "lgaId required." }, { status: 400 });
  const n = Math.min(Math.max(Number(perUnit) || 1, 1), 10); // 1..10 codes per unit

  const election = await db.election.findFirst({ orderBy: { createdAt: "desc" } });
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });

  const units = await db.pollingUnit.findMany({
    where: { lgaId },
    include: { ward: true, lga: true },
    orderBy: { name: "asc" },
    take: 500,
  });
  if (!units.length) return NextResponse.json({ error: "No polling units in this LGA." }, { status: 404 });

  // Cap generation to available seats — you can browse all units, but only make
  // as many codes as your plan allows.
  const seats = await seatStatus(election.id);
  const cap = seats ? seats.available : Number.MAX_SAFE_INTEGER;
  if (seats && cap < 1) {
    return NextResponse.json({ error: `Seat limit reached (${seats.used}/${seats.total}). Buy more seats to add agents.`, needSeats: true }, { status: 402 });
  }

  const created: { name: string; inviteCode: string; unitLabel: string }[] = [];
  outer:
  for (const u of units) {
    const existing = await db.agent.count({ where: { pollingUnitId: u.id } });
    for (let k = 0; k < n; k++) {
      if (created.length >= cap) break outer;
      let code = inviteCode();
      for (let i = 0; i < 10 && (await db.agent.findUnique({ where: { inviteCode: code } })); i++) code = inviteCode();
      const seq = existing + k + 1;
      const agent = await db.agent.create({
        data: { electionId: election.id, name: `${u.name} · Agent ${seq}`, scope: "PU", pollingUnitId: u.id, inviteCode: code, status: "INVITED" },
      });
      created.push({ name: agent.name, inviteCode: agent.inviteCode, unitLabel: `${u.name} · ${u.ward.name} · ${u.lga.name}` });
    }
  }
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "agent:bulk", entity: "Lga", entityId: lgaId, meta: { count: created.length, perUnit: n, units: units.length } } });
  const capped = seats ? created.length >= cap : false;
  return NextResponse.json({ ok: true, count: created.length, created, capped, seatsAvailable: seats ? Math.max(0, cap - created.length) : null });
}
