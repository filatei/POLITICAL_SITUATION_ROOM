import { scopedElection } from "@/lib/election-scope";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { emitAgent, emitDashboard, isOnline } from "@/lib/realtime";

export const runtime = "nodejs";

async function targetAgentIds(target: string, targetId: string | undefined, electionId: string): Promise<string[]> {
  const base = { electionId, status: { not: "SUSPENDED" as const } };
  if (target === "AGENT" && targetId) return [targetId];
  if (target === "UNIT" && targetId) return (await db.agent.findMany({ where: { ...base, pollingUnitId: targetId }, select: { id: true } })).map((a) => a.id);
  if (target === "WARD" && targetId) return (await db.agent.findMany({ where: { ...base, OR: [{ wardId: targetId }, { pollingUnit: { wardId: targetId } }] }, select: { id: true } })).map((a) => a.id);
  if (target === "LGA" && targetId) return (await db.agent.findMany({ where: { ...base, OR: [{ lgaId: targetId }, { pollingUnit: { lgaId: targetId } }] }, select: { id: true } })).map((a) => a.id);
  // ALL
  return (await db.agent.findMany({ where: base, select: { id: true } })).map((a) => a.id);
}

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR", "ANALYST"]))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { target = "AGENT", targetId, title, body, severity = "INFO" } = await req.json();
  if (!body) return NextResponse.json({ error: "Message body required." }, { status: 400 });

  const election = await scopedElection();
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });

  const agentIds = await targetAgentIds(target, targetId, election.id);
  if (!agentIds.length) return NextResponse.json({ error: "No matching agents." }, { status: 400 });

  const instruction = await db.instruction.create({
    data: {
      electionId: election.id, fromUserId: s!.kind === "user" ? s!.sub : null,
      target, targetId: targetId ?? null, title, body, severity,
      receipts: { create: agentIds.map((agentId) => ({ agentId })) },
    },
    include: { receipts: true },
  });

  // Deliver to any online agents now; offline agents get it on reconnect flush.
  for (const r of instruction.receipts) {
    if (isOnline(r.agentId)) {
      emitAgent(r.agentId, "instruction", {
        receiptId: r.id, id: instruction.id, title: instruction.title,
        body: instruction.body, severity: instruction.severity, createdAt: instruction.createdAt,
      });
    }
  }
  emitDashboard("instruction:new", { id: instruction.id, target, targetId, recipients: agentIds.length });
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "instruction:send", entity: "Instruction", entityId: instruction.id, meta: { target, recipients: agentIds.length } } });

  return NextResponse.json({ ok: true, id: instruction.id, recipients: agentIds.length });
}

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (s.kind === "agent") {
    const receipts = await db.instructionReceipt.findMany({
      where: { agentId: s.sub },
      include: { instruction: true },
      orderBy: { instruction: { createdAt: "desc" } },
      take: 50,
    });
    return NextResponse.json({
      instructions: receipts.map((r) => ({
        receiptId: r.id, id: r.instruction.id, title: r.instruction.title, body: r.instruction.body,
        severity: r.instruction.severity, createdAt: r.instruction.createdAt, status: r.status,
      })),
    });
  }

  // Staff: recent instructions with delivery rollup.
  const rows = await db.instruction.findMany({
    orderBy: { createdAt: "desc" }, take: 40, include: { receipts: true, fromUser: true },
  });
  return NextResponse.json({
    instructions: rows.map((i) => ({
      id: i.id, title: i.title, body: i.body, severity: i.severity, target: i.target, createdAt: i.createdAt,
      from: i.fromUser?.name ?? "system",
      total: i.receipts.length,
      delivered: i.receipts.filter((r) => r.status !== "SENT").length,
      read: i.receipts.filter((r) => r.status === "READ").length,
    })),
  });
}
