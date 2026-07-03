import { scopedElection } from "@/lib/election-scope";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const election = await scopedElection();
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });

  const candidates = await db.candidate.findMany({ where: { electionId: election.id }, include: { party: true } });
  const subs = await db.submission.findMany({
    where: { electionId: election.id, type: "SCORE" },
    include: { scores: true },
  });

  const zero = () => ({ verified: 0, declared: 0, perceived: 0 });
  const byCand: Record<string, ReturnType<typeof zero>> = {};
  for (const c of candidates) byCand[c.id] = zero();

  const reportedUnits = new Set<string>();
  const verifiedUnits = new Set<string>();
  let accredited = 0, cast = 0, rejected = 0;

  for (const sub of subs) {
    if (sub.pollingUnitId) reportedUnits.add(sub.pollingUnitId);
    const isVerified = sub.scoreStatus === "VERIFIED";
    if (isVerified && sub.pollingUnitId) verifiedUnits.add(sub.pollingUnitId);
    if (isVerified) {
      accredited += sub.accreditedVoters || 0;
      cast += sub.totalVotesCast || 0;
      rejected += sub.rejectedBallots || 0;
    }
    for (const sc of sub.scores) {
      const b = byCand[sc.candidateId];
      if (!b) continue;
      if (isVerified) b.verified += sc.votes;
      if (sub.confidence === "DECLARED") b.declared += sc.votes;
      if (sub.confidence === "PERCEIVED") b.perceived += sc.votes;
    }
  }

  const totalUnits = await db.pollingUnit.count();
  const leaderboard = candidates
    .map((c) => ({
      candidateId: c.id, name: c.name, party: c.party.code, color: c.party.color,
      ...byCand[c.id],
    }))
    .sort((a, b) => b.verified - a.verified || b.declared - a.declared);

  return NextResponse.json({
    leaderboard,
    reporting: { reported: reportedUnits.size, verified: verifiedUnits.size, total: totalUnits },
    turnout: { accredited, cast, rejected },
    updatedAt: new Date().toISOString(),
  });
}
