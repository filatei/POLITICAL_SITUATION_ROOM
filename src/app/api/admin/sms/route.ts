import { scopedElection } from "@/lib/election-scope";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { sendBulkSms, smsEnabled } from "@/lib/sms";
import { sendWhatsAppBulk, whatsappEnabled } from "@/lib/whatsapp";

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
  return NextResponse.json({ smsEnabled, whatsappEnabled, total, withPhone });
}

// POST — message agents in THIS election over SMS or WhatsApp.
//   body: { message: string, agentIds?: string[], channel?: "sms" | "whatsapp" }
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const election = await scopedElection();
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });

  const { message, agentIds, channel } = await req.json().catch(() => ({}));
  const text = String(message || "").trim();
  const useWa = channel === "whatsapp";
  if (!text) return NextResponse.json({ error: "Message is required." }, { status: 400 });
  if (text.length > 480) return NextResponse.json({ error: "Message too long (max 480 characters)." }, { status: 400 });
  if (useWa && !whatsappEnabled) return NextResponse.json({ error: "WhatsApp is not configured on the server (set WHATSAPP_* env)." }, { status: 503 });
  if (!useWa && !smsEnabled) return NextResponse.json({ error: "SMS is not configured on the server (set SMS_PROVIDER + SMS_API_KEY)." }, { status: 503 });

  const where: any = { electionId: election.id, phone: { not: null } };
  if (Array.isArray(agentIds) && agentIds.length) where.id = { in: agentIds };
  const agents = await db.agent.findMany({ where, select: { phone: true } });
  if (!agents.length) return NextResponse.json({ error: "No agents with a phone number match this selection." }, { status: 400 });

  const phones = agents.map((a: { phone: string | null }) => a.phone);
  const result = useWa ? await sendWhatsAppBulk(phones, text) : await sendBulkSms(phones, text);
  await db.auditLog.create({
    data: { actorType: s!.kind, actorId: s!.sub, action: `agent:${useWa ? "whatsapp" : "sms"}`, entity: "Election", entityId: election.id,
      meta: { recipients: agents.length, sent: result.sent, failed: result.failed, chars: text.length } },
  }).catch(() => {});

  return NextResponse.json({ ok: result.failed === 0, channel: useWa ? "whatsapp" : "sms", ...result });
}
