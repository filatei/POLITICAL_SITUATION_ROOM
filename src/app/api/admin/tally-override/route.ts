import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { publish } from "@/lib/events";
import { unitLabel } from "@/lib/geo";

export const runtime = "nodejs";

// Manual tally override — an admin/coordinator enters an official unit result
// directly (e.g. off a physical INEC form) with no agent submission. It is
// stored as a VERIFIED, DECLARED SCORE submission authored by the admin, so it
// feeds the existing verified tally with no special-casing. Every create/edit
// is written to AuditLog so the override itself stays auditable.

const schema = z.object({
  pollingUnitId: z.string().min(1),
  scores: z.array(z.object({ candidateId: z.string(), votes: z.number().int().min(0) })).min(1),
  accreditedVoters: z.number().int().min(0).optional(),
  totalVotesCast: z.number().int().min(0).optional(),
  rejectedBallots: z.number().int().min(0).optional(),
});

// GET — data the override form needs: candidates + units + existing overrides.
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const election = await db.election.findFirst({ orderBy: { createdAt: "desc" } });
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });

  const candidates = await db.candidate.findMany({ where: { electionId: election.id }, include: { party: true } });
  const overrides = await db.submission.findMany({
    where: { electionId: election.id, clientUid: { startsWith: `manual:${election.id}:` } },
    include: { user: true, scores: true, pollingUnit: { include: { ward: true, lga: true } } },
    orderBy: { receivedAt: "desc" },
  });

  return NextResponse.json({
    candidates: candidates
      .map((c) => ({ id: c.id, name: c.name, party: c.party.code, color: c.party.color }))
      .sort((a, b) => a.party.localeCompare(b.party)),
    overrides: overrides.map((o) => ({
      id: o.id,
      pollingUnitId: o.pollingUnitId,
      unitLabel: o.pollingUnit ? `${o.pollingUnit.name} · ${o.pollingUnit.ward.name} · ${o.pollingUnit.lga.name}` : "—",
      by: o.user?.name ?? "—",
      at: o.receivedAt,
      accreditedVoters: o.accreditedVoters,
      totalVotesCast: o.totalVotesCast,
      rejectedBallots: o.rejectedBallots,
      scores: o.scores.map((x) => ({ candidateId: x.candidateId, votes: x.votes })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;

  const election = await db.election.findFirst({ orderBy: { createdAt: "desc" } });
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });

  const unit = await db.pollingUnit.findUnique({ where: { id: b.pollingUnitId } });
  if (!unit) return NextResponse.json({ error: "Unknown polling unit." }, { status: 404 });

  // Stable key so re-entering a unit edits its single official result.
  const clientUid = `manual:${election.id}:${b.pollingUnitId}`;
  const prior = await db.submission.findUnique({ where: { clientUid }, include: { scores: true } });

  const sub = await db.$transaction(async (tx) => {
    if (prior) {
      await tx.scoreRecord.deleteMany({ where: { submissionId: prior.id } });
      return tx.submission.update({
        where: { id: prior.id },
        data: {
          accreditedVoters: b.accreditedVoters ?? null,
          totalVotesCast: b.totalVotesCast ?? null,
          rejectedBallots: b.rejectedBallots ?? null,
          receivedAt: new Date(),
          userId: s!.kind === "user" ? s!.sub : undefined,
          scores: { create: b.scores.map((x) => ({ candidateId: x.candidateId, votes: x.votes })) },
        },
        include: { user: true, scores: { include: { candidate: { include: { party: true } } } } },
      });
    }
    return tx.submission.create({
      data: {
        clientUid,
        electionId: election.id,
        type: "SCORE",
        channel: "TEXT",
        text: "Official result (admin entry)",
        confidence: "DECLARED",
        scoreStatus: "VERIFIED",
        sheetSigned: true,
        pollingUnitId: b.pollingUnitId,
        userId: s!.kind === "user" ? s!.sub : undefined,
        accreditedVoters: b.accreditedVoters ?? null,
        totalVotesCast: b.totalVotesCast ?? null,
        rejectedBallots: b.rejectedBallots ?? null,
        capturedAt: new Date(),
        scores: { create: b.scores.map((x) => ({ candidateId: x.candidateId, votes: x.votes })) },
      },
      include: { user: true, scores: { include: { candidate: { include: { party: true } } } } },
    });
  });

  // Audit trail — who set/edited what, with before/after vote maps.
  await db.auditLog.create({
    data: {
      actorType: "user",
      actorId: s!.sub,
      action: prior ? "tally.override.update" : "tally.override.create",
      entity: "PollingUnit",
      entityId: b.pollingUnitId,
      meta: {
        by: s!.name,
        unit: `${unit.name}`,
        before: prior ? prior.scores.map((x) => ({ candidateId: x.candidateId, votes: x.votes })) : null,
        after: b.scores,
        turnout: { accreditedVoters: b.accreditedVoters, totalVotesCast: b.totalVotesCast, rejectedBallots: b.rejectedBallots },
      },
    },
  });

  // Push to the live wall like any other verified score.
  const label = await unitLabel(sub.pollingUnitId);
  publish({
    kind: "submission",
    payload: {
      id: sub.id, type: "SCORE", channel: "TEXT", text: sub.text,
      confidence: sub.confidence, sheetSigned: sub.sheetSigned, scoreStatus: sub.scoreStatus,
      author: sub.user?.name ?? "Admin", unitLabel: label,
      capturedAt: sub.capturedAt, receivedAt: sub.receivedAt,
      scores: sub.scores.map((x) => ({ party: x.candidate.party.code, color: x.candidate.party.color, votes: x.votes })),
      media: [],
    },
  });

  return NextResponse.json({ ok: true, id: sub.id, edited: !!prior });
}
