import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { publish } from "@/lib/events";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR", "ANALYST"]))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { status } = await req.json();
  if (!["VERIFIED", "DISPUTED", "PENDING"].includes(status))
    return NextResponse.json({ error: "Bad status" }, { status: 400 });

  const updated = await db.submission.update({ where: { id: params.id }, data: { scoreStatus: status } });
  await db.auditLog.create({
    data: { actorType: s!.kind, actorId: s!.sub, action: `score:${status}`, entity: "Submission", entityId: params.id },
  });
  publish({ kind: "verify", payload: { id: params.id, status } });
  return NextResponse.json({ ok: true, id: updated.id, status });
}
