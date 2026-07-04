import { scopedElection } from "@/lib/election-scope";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { inviteCode } from "@/lib/code";
import { seatStatus } from "@/lib/seats";

export const runtime = "nodejs";

// Generate `perUnit` fresh codes for the SELECTED scope, drilling down
// LGA → Ward → Unit: pass unitId for a single unit, wardId for every unit in a
// ward, or lgaId for every unit in an LGA. Additive: re-running mints another
// distinct set (units aren't skipped), so an admin can top up over time.
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { lgaId, wardId, unitId, perUnit } = await req.json();
  if (!lgaId && !wardId && !unitId) return NextResponse.json({ error: "Select an LGA, ward or unit." }, { status: 400 });
  const n = Math.min(Math.max(Number(perUnit) || 1, 1), 10); // 1..10 codes per unit

  const election = await scopedElection();
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });

  // Deepest selection wins: unit → ward → LGA.
  const where = unitId ? { id: unitId } : wardId ? { wardId } : { lgaId };
  const scopeLabel = unitId ? "unit" : wardId ? "ward" : "LGA";
  const units = await db.pollingUnit.findMany({
    where,
    include: { ward: true, lga: true },
    orderBy: { name: "asc" },
    take: 500,
  });
  if (!units.length) return NextResponse.json({ error: `No polling units in this ${scopeLabel}.` }, { status: 404 });

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
  const entityId = unitId || wardId || lgaId;
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "agent:bulk", entity: scopeLabel, entityId, meta: { count: created.length, perUnit: n, units: units.length, scope: scopeLabel } } });
  const capped = seats ? created.length >= cap : false;
  return NextResponse.json({ ok: true, count: created.length, created, capped, seatsAvailable: seats ? Math.max(0, cap - created.length) : null });
}
