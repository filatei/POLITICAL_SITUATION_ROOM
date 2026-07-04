import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { inviteCode } from "@/lib/code";
import { scopedElection } from "@/lib/election-scope";

export const runtime = "nodejs";

// Regenerate an agent's code and clear their PIN (they set a new one on next login).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Only reset an agent in the caller's own election.
  const election = await scopedElection();
  const target = await db.agent.findUnique({ where: { id: params.id }, select: { electionId: true } });
  if (!target || (election && target.electionId !== election.id))
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  let code = inviteCode();
  for (let i = 0; i < 10 && (await db.agent.findUnique({ where: { inviteCode: code } })); i++) code = inviteCode();
  const a = await db.agent.update({
    where: { id: params.id },
    data: { inviteCode: code, pinHash: null, inviteUsedAt: null, status: "INVITED", tokenVersion: { increment: 1 } },
  });
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "agent:reset", entity: "Agent", entityId: a.id } });
  return NextResponse.json({ ok: true, inviteCode: a.inviteCode });
}
