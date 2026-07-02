import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { inviteCode } from "@/lib/code";

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
      id: a.id, name: a.name, phone: a.phone, inviteCode: a.inviteCode, status: a.status,
      usedAt: a.inviteUsedAt, lastSeenAt: a.lastSeenAt,
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
  const { name, phone, pollingUnitId } = await req.json();
  if (!name || !pollingUnitId) return NextResponse.json({ error: "Name and polling unit are required." }, { status: 400 });

  const election = await db.election.findFirst({ orderBy: { createdAt: "desc" } });
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });
  const pu = await db.pollingUnit.findUnique({ where: { id: pollingUnitId }, include: { ward: true, lga: true } });
  if (!pu) return NextResponse.json({ error: "Unknown polling unit." }, { status: 404 });

  const code = await uniqueCode();
  const agent = await db.agent.create({
    data: { electionId: election.id, name, phone: phone || null, scope: "PU", pollingUnitId, inviteCode: code, status: "INVITED" },
  });
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "agent:create", entity: "Agent", entityId: agent.id, meta: { unit: pu.name } } });
  return NextResponse.json({ ok: true, agent: { id: agent.id, name: agent.name, inviteCode: agent.inviteCode, unitLabel: `${pu.name} · ${pu.ward.name} · ${pu.lga.name}` } });
}
