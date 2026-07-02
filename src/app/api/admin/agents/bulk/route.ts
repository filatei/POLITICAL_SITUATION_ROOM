import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { inviteCode } from "@/lib/code";

export const runtime = "nodejs";

// Generate one agent (+ code) for every polling unit in an LGA that has none yet.
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { lgaId } = await req.json();
  if (!lgaId) return NextResponse.json({ error: "lgaId required." }, { status: 400 });

  const election = await db.election.findFirst({ orderBy: { createdAt: "desc" } });
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });

  const units = await db.pollingUnit.findMany({
    where: { lgaId, agents: { none: {} } },
    include: { ward: true, lga: true },
    orderBy: { name: "asc" },
    take: 500,
  });

  const created: { name: string; inviteCode: string; unitLabel: string }[] = [];
  for (const u of units) {
    let code = inviteCode();
    for (let i = 0; i < 10 && (await db.agent.findUnique({ where: { inviteCode: code } })); i++) code = inviteCode();
    const agent = await db.agent.create({
      data: { electionId: election.id, name: `Agent ${u.name}`, scope: "PU", pollingUnitId: u.id, inviteCode: code, status: "INVITED" },
    });
    created.push({ name: agent.name, inviteCode: agent.inviteCode, unitLabel: `${u.name} · ${u.ward.name} · ${u.lga.name}` });
  }
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "agent:bulk", entity: "Lga", entityId: lgaId, meta: { count: created.length } } });
  return NextResponse.json({ ok: true, count: created.length, created });
}
