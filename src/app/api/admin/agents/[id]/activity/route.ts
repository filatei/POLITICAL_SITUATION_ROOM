import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

export const runtime = "nodejs";

// Everything a given code's agent has sent — scores, messages, incidents — with
// the GPS coordinates captured at the moment each was submitted.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const agent = await db.agent.findUnique({
    where: { id: params.id },
    include: { pollingUnit: { include: { ward: true, lga: true, state: true } } },
  });
  if (!agent) return NextResponse.json({ error: "Unknown code." }, { status: 404 });

  const subs = await db.submission.findMany({
    where: { agentId: agent.id },
    orderBy: { receivedAt: "desc" },
    take: 200,
    include: { scores: { include: { candidate: { include: { party: true } } } }, media: true },
  });

  return NextResponse.json({
    agent: {
      id: agent.id, name: agent.name, inviteCode: agent.inviteCode, status: agent.status,
      email: agent.email, phone: agent.phone, usedAt: agent.inviteUsedAt, lastSeenAt: agent.lastSeenAt,
      unitLabel: agent.pollingUnit
        ? `${agent.pollingUnit.name} · ${agent.pollingUnit.ward.name} · ${agent.pollingUnit.lga.name} · ${agent.pollingUnit.state.name}`
        : "—",
    },
    counts: {
      total: subs.length,
      scores: subs.filter((x) => x.type === "SCORE").length,
      messages: subs.filter((x) => x.type === "MESSAGE" || x.type === "STATUS").length,
      incidents: subs.filter((x) => x.type === "INCIDENT").length,
    },
    submissions: subs.map((r) => ({
      id: r.id, type: r.type, text: r.text, severity: r.severity, confidence: r.confidence,
      scoreStatus: r.scoreStatus, receivedAt: r.receivedAt, capturedAt: r.capturedAt,
      lat: r.lat, lng: r.lng,
      scores: r.scores.map((x) => ({ party: x.candidate.party.code, color: x.candidate.party.color, votes: x.votes })),
      media: r.media.map((m) => ({ url: m.url, thumbUrl: m.thumbUrl, kind: m.kind, mime: m.mime })),
    })),
  });
}
