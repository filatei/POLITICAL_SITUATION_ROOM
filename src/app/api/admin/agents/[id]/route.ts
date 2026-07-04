import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { scopedElection } from "@/lib/election-scope";

export const runtime = "nodejs";

// Permanently delete an agent/code from the caller's own election. Any field data
// they already submitted is kept but unlinked (agentId → null); their instruction
// receipts are removed. Use for pruning leftover/test codes.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const election = await scopedElection();
  const agent = await db.agent.findUnique({ where: { id: params.id }, select: { id: true, name: true, electionId: true } });
  if (!agent || (election && agent.electionId !== election.id))
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  await db.$transaction([
    db.submission.updateMany({ where: { agentId: agent.id }, data: { agentId: null } }),
    db.instructionReceipt.deleteMany({ where: { agentId: agent.id } }),
    db.agent.delete({ where: { id: agent.id } }),
  ]);
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "agent:delete", entity: "Agent", entityId: agent.id, meta: { name: agent.name } } });
  return NextResponse.json({ ok: true });
}
