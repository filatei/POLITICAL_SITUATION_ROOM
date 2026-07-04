import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sessionIsSuper } from "@/lib/tenant";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

async function resolve(slug: string) {
  return db.tenant.findUnique({ where: { slug: slug.toLowerCase() } });
}

// Full reset back to zero: wipe all activity (messages, incidents, updates,
// scores, instructions) AND all agent codes — keeps the room, the ballot,
// geography and branding. The election starts clean with fresh seats.
async function resetActivity(electionId: string) {
  return db.$transaction([
    db.submission.deleteMany({ where: { electionId } }),  // cascades ScoreRecord + Media
    db.instruction.deleteMany({ where: { electionId } }), // cascades InstructionReceipt
    db.agent.deleteMany({ where: { electionId } }),       // clear all access codes → back to zero
  ]);
}

// POST { action:"reset" } — zero the room's activity. Super-admin only.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const s = await getSession(req);
  if (!s || !(await sessionIsSuper(s))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body?.action !== "reset") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const t = await resolve(params.slug);
  if (!t) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  const [subs, ins, ags] = await resetActivity(t.electionId);
  return NextResponse.json({ ok: true, reset: true, removed: { submissions: subs.count, instructions: ins.count, agents: ags.count } });
}

// DELETE — remove the tenant, its election and ALL related data. Super-admin
// only; requires ?confirm=<slug> to avoid accidents.
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const s = await getSession(req);
  if (!s || !(await sessionIsSuper(s))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const confirm = new URL(req.url).searchParams.get("confirm");
  if (confirm !== params.slug) return NextResponse.json({ error: "confirm must equal the slug" }, { status: 400 });
  const t = await resolve(params.slug);
  if (!t) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  const e = t.electionId;

  await db.$transaction([
    db.submission.deleteMany({ where: { electionId: e } }),     // -> ScoreRecord, Media (cascade)
    db.instruction.deleteMany({ where: { electionId: e } }),    // -> InstructionReceipt (cascade)
    db.candidate.deleteMany({ where: { electionId: e } }),
    db.party.deleteMany({ where: { electionId: e } }),
    db.agent.deleteMany({ where: { electionId: e } }),
    db.subscription.deleteMany({ where: { electionId: e } }),
    db.payment.updateMany({ where: { electionId: e }, data: { electionId: null } }),
    db.tenant.delete({ where: { id: t.id } }),
    db.election.delete({ where: { id: e } }),
  ]);
  await db.auditLog.create({ data: { actorType: "super", action: "tenant:delete", entity: "Tenant", entityId: t.id, meta: { slug: t.slug } } }).catch(() => {});
  return NextResponse.json({ ok: true, deleted: params.slug });
}
