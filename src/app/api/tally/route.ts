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

  // Tally is party-based: every party on the ballot shows from the start (at 0),
  // and totals grow only from ACCEPTED (verified) scores.
  const parties = await db.party.findMany({ where: { electionId: election.id } });
  const subs = await db.submission.findMany({
    where: { electionId: election.id, type: "SCORE" },
    include: { scores: { include: { candidate: { include: { party: true } } } } },
  });

  const zero = () => ({ verified: 0, declared: 0, perceived: 0 });
  const byParty: Record<string, ReturnType<typeof zero>> = {};
  for (const p of parties) byParty[p.code] = zero();

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
      const code = sc.candidate?.party?.code;
      let b = code ? byParty[code] : undefined;
      // a score for a party not in the current ballot list still counts
      if (!b && code) { b = zero(); byParty[code] = b; }
      if (!b) continue;
      if (isVerified) b.verified += sc.votes;
      if (sub.confidence === "DECLARED") b.declared += sc.votes;
      if (sub.confidence === "PERCEIVED") b.perceived += sc.votes;
    }
  }

  const totalUnits = await db.pollingUnit.count();
  const colorByCode: Record<string, string> = {};
  const nameByCode: Record<string, string> = {};
  for (const p of parties) { colorByCode[p.code] = p.color; nameByCode[p.code] = p.name; }
  const leaderboard = Object.keys(byParty)
    .map((code) => ({
      candidateId: code, name: nameByCode[code] || code, party: code, color: colorByCode[code] || "#888888",
      ...byParty[code],
    }))
    .sort((a, b) => b.verified - a.verified || b.declared - a.declared || a.party.localeCompare(b.party));

  return NextResponse.json({
    leaderboard,
    reporting: { reported: reportedUnits.size, verified: verifiedUnits.size, total: totalUnits },
    turnout: { accredited, cast, rejected },
    updatedAt: new Date().toISOString(),
  });
}
