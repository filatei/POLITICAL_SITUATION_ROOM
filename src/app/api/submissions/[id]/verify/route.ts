import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { publish } from "@/lib/events";
import { scopedElection } from "@/lib/election-scope";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR", "ANALYST"]))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { status } = await req.json();
  if (!["VERIFIED", "DISPUTED", "PENDING"].includes(status))
    return NextResponse.json({ error: "Bad status" }, { status: 400 });

  // Only verify a submission that belongs to the caller's own election.
  const election = await scopedElection();
  const target = await db.submission.findUnique({ where: { id: params.id }, select: { electionId: true } });
  if (!target || (election && target.electionId !== election.id))
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const updated = await db.submission.update({ where: { id: params.id }, data: { scoreStatus: status } });
  await db.auditLog.create({
    data: { actorType: s!.kind, actorId: s!.sub, action: `score:${status}`, entity: "Submission", entityId: params.id },
  });
  publish({ kind: "verify", electionId: updated.electionId, payload: { id: params.id, status } });
  return NextResponse.json({ ok: true, id: updated.id, status });
}
