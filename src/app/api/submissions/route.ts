import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { publish } from "@/lib/events";
import { unitLabel } from "@/lib/geo";

export const runtime = "nodejs";

const schema = z.object({
  clientUid: z.string().min(8),
  type: z.enum(["MESSAGE", "SCORE", "INCIDENT", "STATUS"]),
  channel: z.enum(["TEXT", "VOICE"]).default("TEXT"),
  text: z.string().optional(),
  severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  capturedAt: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  pollingUnitId: z.string().optional(),
  accreditedVoters: z.number().int().optional(),
  totalVotesCast: z.number().int().optional(),
  rejectedBallots: z.number().int().optional(),
  confidence: z.enum(["DECLARED", "PERCEIVED", "ESTIMATE"]).optional(),
  sheetSigned: z.boolean().optional(),
  scores: z.array(z.object({ candidateId: z.string(), votes: z.number().int().min(0) })).optional(),
  media: z.array(z.object({
    url: z.string(), mime: z.string(), size: z.number().int(),
    kind: z.enum(["RESULT_SHEET", "INCIDENT", "VOICE", "OTHER"]).default("OTHER"),
    thumbUrl: z.string().optional(), durationSec: z.number().int().optional(), sheetSigned: z.boolean().optional(),
  })).optional(),
});

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;

  // Idempotency: same clientUid returns the existing row (safe retries).
  const existing = await db.submission.findUnique({ where: { clientUid: b.clientUid } });
  if (existing) return NextResponse.json({ ok: true, id: existing.id, deduped: true });

  const election = await db.election.findFirst({ orderBy: { createdAt: "desc" } });
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });

  // Agents can only file for their own unit.
  const pollingUnitId = s.kind === "agent" ? s.unitId ?? undefined : b.pollingUnitId;

  const created = await db.submission.create({
    data: {
      clientUid: b.clientUid,
      electionId: election.id,
      type: b.type,
      channel: b.channel,
      text: b.text,
      severity: b.severity,
      agentId: s.kind === "agent" ? s.sub : undefined,
      userId: s.kind === "user" ? s.sub : undefined,
      pollingUnitId: pollingUnitId,
      accreditedVoters: b.accreditedVoters,
      totalVotesCast: b.totalVotesCast,
      rejectedBallots: b.rejectedBallots,
      confidence: b.confidence,
      sheetSigned: b.sheetSigned,
      capturedAt: b.capturedAt ? new Date(b.capturedAt) : new Date(),
      lat: b.lat,
      lng: b.lng,
      scores: b.scores ? { create: b.scores.map((x) => ({ candidateId: x.candidateId, votes: x.votes })) } : undefined,
      media: b.media ? { create: b.media } : undefined,
    },
    include: { agent: true, user: true, scores: { include: { candidate: { include: { party: true } } } }, media: true },
  });

  const label = await unitLabel(created.pollingUnitId);
  const wire = {
    id: created.id, type: created.type, channel: created.channel, text: created.text,
    severity: created.severity, confidence: created.confidence, sheetSigned: created.sheetSigned,
    author: created.agent?.name ?? created.user?.name ?? "Unknown",
    unitLabel: label, lat: created.lat, lng: created.lng,
    capturedAt: created.capturedAt, receivedAt: created.receivedAt,
    scoreStatus: created.scoreStatus,
    scores: created.scores.map((x) => ({ party: x.candidate.party.code, color: x.candidate.party.color, votes: x.votes })),
    media: created.media.map((m) => ({ url: m.url, thumbUrl: m.thumbUrl, kind: m.kind, mime: m.mime })),
  };
  publish({ kind: "submission", payload: wire });
  return NextResponse.json({ ok: true, id: created.id, submission: wire });
}

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as any;
  const limit = Math.min(Number(url.searchParams.get("limit") || 60), 200);

  const rows = await db.submission.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(s.kind === "agent" ? { agentId: s.sub } : {}),
    },
    orderBy: { receivedAt: "desc" },
    take: limit,
    include: {
      agent: true, user: true,
      pollingUnit: { include: { ward: true, lga: true, state: true } },
      scores: { include: { candidate: { include: { party: true } } } },
      media: true,
    },
  });

  const data = rows.map((r) => ({
    id: r.id, type: r.type, channel: r.channel, text: r.text, severity: r.severity,
    confidence: r.confidence, sheetSigned: r.sheetSigned, scoreStatus: r.scoreStatus,
    author: r.agent?.name ?? r.user?.name ?? "Unknown",
    unitLabel: r.pollingUnit ? `${r.pollingUnit.name} · ${r.pollingUnit.ward.name} · ${r.pollingUnit.lga.name}` : "—",
    lat: r.lat, lng: r.lng, capturedAt: r.capturedAt, receivedAt: r.receivedAt,
    accreditedVoters: r.accreditedVoters, totalVotesCast: r.totalVotesCast, rejectedBallots: r.rejectedBallots,
    scores: r.scores.map((x) => ({ party: x.candidate.party.code, color: x.candidate.party.color, votes: x.votes })),
    media: r.media.map((m) => ({ url: m.url, thumbUrl: m.thumbUrl, kind: m.kind, mime: m.mime })),
  }));
  return NextResponse.json({ submissions: data });
}
