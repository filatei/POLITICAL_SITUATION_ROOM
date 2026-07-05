import { scopedElection } from "@/lib/election-scope";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { sendBulkSms, smsEnabled } from "@/lib/sms";

export const runtime = "nodejs";

// GET — how many agents in this election have a phone (for the compose UI).
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const election = await scopedElection();
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });
  const [total, withPhone] = await Promise.all([
    db.agent.count({ where: { electionId: election.id } }),
    db.agent.count({ where: { electionId: election.id, phone: { not: null } } }),
  ]);
  return NextResponse.json({ smsEnabled, total, withPhone });
}

// POST — broadcast an SMS to agents in THIS election.
//   body: { message: string, agentIds?: string[] }  (omit agentIds = all with a phone)
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const election = await scopedElection();
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });

  const { message, agentIds } = await req.json().catch(() => ({}));
  const text = String(message || "").trim();
  if (!text) return NextResponse.json({ error: "Message is required." }, { status: 400 });
  if (text.length > 480) return NextResponse.json({ error: "Message too long (max 480 characters)." }, { status: 400 });
  if (!smsEnabled) return NextResponse.json({ error: "SMS is not configured on the server (set SMS_PROVIDER + SMS_API_KEY)." }, { status: 503 });

  const where: any = { electionId: election.id, phone: { not: null } };
  if (Array.isArray(agentIds) && agentIds.length) where.id = { in: agentIds };
  const agents = await db.agent.findMany({ where, select: { phone: true } });
  if (!agents.length) return NextResponse.json({ error: "No agents with a phone number match this selection." }, { status: 400 });

  const result = await sendBulkSms(agents.map((a: { phone: string | null }) => a.phone), text);
  await db.auditLog.create({
    data: { actorType: s!.kind, actorId: s!.sub, action: "agent:sms", entity: "Election", entityId: election.id,
      meta: { recipients: agents.length, sent: result.sent, failed: result.failed, chars: text.length } },
  }).catch(() => {});

  return NextResponse.json({ ok: result.failed === 0, ...result });
}
