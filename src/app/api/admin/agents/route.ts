import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { inviteCode } from "@/lib/code";
import { seatStatus } from "@/lib/seats";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const agents = await db.agent.findMany({
    orderBy: { createdAt: "desc" }, take: 500,
    include: { pollingUnit: { include: { ward: true, lga: true } } },
  });
  return NextResponse.json({
    agents: agents.map((a) => ({
      id: a.id, name: a.name, phone: a.phone, email: a.email, inviteCode: a.inviteCode, status: a.status,
      usedAt: a.inviteUsedAt, lastSeenAt: a.lastSeenAt,
      lgaId: a.pollingUnit?.lgaId ?? null,
      unit: a.pollingUnit?.name ?? null,
      unitLabel: a.pollingUnit ? `${a.pollingUnit.name} · ${a.pollingUnit.ward.name} · ${a.pollingUnit.lga.name}` : "—",
    })),
  });
}

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const c = inviteCode();
    if (!(await db.agent.findUnique({ where: { inviteCode: c } }))) return c;
  }
  return inviteCode() + "-" + Date.now().toString(36).slice(-3).toUpperCase();
}

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { name, phone, email, pollingUnitId } = await req.json();
  if (!name || !pollingUnitId) return NextResponse.json({ error: "Name and polling unit are required." }, { status: 400 });
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;
  if (cleanEmail && await db.agent.findUnique({ where: { email: cleanEmail } }))
    return NextResponse.json({ error: "That Google email is already enrolled for another agent." }, { status: 409 });

  const election = await db.election.findFirst({ orderBy: { createdAt: "desc" } });
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });

  // Seat cap: you can browse every unit, but only create as many codes as you have seats.
  const seats = await seatStatus(election.id);
  if (seats && seats.available < 1) {
    return NextResponse.json({ error: `Seat limit reached (${seats.used}/${seats.total}). Buy more seats to add agents.`, needSeats: true }, { status: 402 });
  }

  const pu = await db.pollingUnit.findUnique({ where: { id: pollingUnitId }, include: { ward: true, lga: true } });
  if (!pu) return NextResponse.json({ error: "Unknown polling unit." }, { status: 404 });

  const code = await uniqueCode();
  const agent = await db.agent.create({
    data: { electionId: election.id, name, phone: phone || null, email: cleanEmail, scope: "PU", pollingUnitId, inviteCode: code, status: "INVITED" },
  });
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "agent:create", entity: "Agent", entityId: agent.id, meta: { unit: pu.name } } });
  return NextResponse.json({ ok: true, agent: { id: agent.id, name: agent.name, inviteCode: agent.inviteCode, unitLabel: `${pu.name} · ${pu.ward.name} · ${pu.lga.name}` } });
}

// Record who a code is being sent to (recipient name / phone / Google email).
export async function PATCH(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, name, phone, email } = await req.json();
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const cleanEmail = email ? String(email).trim().toLowerCase() : undefined;
  if (cleanEmail) {
    const clash = await db.agent.findUnique({ where: { email: cleanEmail } });
    if (clash && clash.id !== id) return NextResponse.json({ error: "That Google email is already used by another agent." }, { status: 409 });
  }

  const data: any = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (phone !== undefined) data.phone = phone ? String(phone).trim() : null;
  if (email !== undefined) data.email = cleanEmail ?? null;
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const agent = await db.agent.update({ where: { id }, data });
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "agent:assign", entity: "Agent", entityId: id, meta: { name: agent.name, phone: agent.phone, email: agent.email } } });
  return NextResponse.json({ ok: true, agent: { id: agent.id, name: agent.name, phone: agent.phone, email: agent.email } });
}
