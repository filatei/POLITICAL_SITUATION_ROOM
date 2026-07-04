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
  const eid = election.id;

  // Party-based tally: every party on the ballot shows from the start (at 0);
  // totals grow only from ACCEPTED (verified) scores. All heavy lifting is done
  // in SQL (groupBy / aggregate) rather than loading every score row into JS.
  const [parties, candidates, verifiedByCand, declaredByCand, perceivedByCand] = await Promise.all([
    db.party.findMany({ where: { electionId: eid }, select: { code: true, name: true, color: true } }),
    db.candidate.findMany({ where: { electionId: eid }, select: { id: true, party: { select: { code: true } } } }),
    db.scoreRecord.groupBy({ by: ["candidateId"], where: { submission: { electionId: eid, type: "SCORE", scoreStatus: "VERIFIED" } }, _sum: { votes: true } }),
    db.scoreRecord.groupBy({ by: ["candidateId"], where: { submission: { electionId: eid, type: "SCORE", confidence: "DECLARED" } }, _sum: { votes: true } }),
    db.scoreRecord.groupBy({ by: ["candidateId"], where: { submission: { electionId: eid, type: "SCORE", confidence: "PERCEIVED" } }, _sum: { votes: true } }),
  ]);

  const codeOfCand = new Map<string, string | undefined>(candidates.map((c): [string, string | undefined] => [c.id, c.party?.code]));
  const zero = () => ({ verified: 0, declared: 0, perceived: 0 });
  const byParty: Record<string, ReturnType<typeof zero>> = {};
  for (const p of parties) byParty[p.code] = zero();
  const bucket = (code: string | null | undefined) => {
    if (!code) return null;
    let b = byParty[code];
    if (!b) { b = zero(); byParty[code] = b; } // score for a party not on the current ballot still counts
    return b;
  };
  for (const g of verifiedByCand) { const b = bucket(codeOfCand.get(g.candidateId)); if (b) b.verified += g._sum.votes || 0; }
  for (const g of declaredByCand) { const b = bucket(codeOfCand.get(g.candidateId)); if (b) b.declared += g._sum.votes || 0; }
  for (const g of perceivedByCand) { const b = bucket(codeOfCand.get(g.candidateId)); if (b) b.perceived += g._sum.votes || 0; }

  // Reporting coverage + turnout, also aggregated in SQL.
  const [reported, verified, turnout, totalUnits] = await Promise.all([
    db.submission.findMany({ where: { electionId: eid, type: "SCORE", pollingUnitId: { not: null } }, distinct: ["pollingUnitId"], select: { pollingUnitId: true } }),
    db.submission.findMany({ where: { electionId: eid, type: "SCORE", scoreStatus: "VERIFIED", pollingUnitId: { not: null } }, distinct: ["pollingUnitId"], select: { pollingUnitId: true } }),
    db.submission.aggregate({ where: { electionId: eid, type: "SCORE", scoreStatus: "VERIFIED" }, _sum: { accreditedVoters: true, totalVotesCast: true, rejectedBallots: true } }),
    totalUnitsForScope(election.scopeStateId, election.scopeConstituencyId),
  ]);

  const colorByCode = new Map(parties.map((p) => [p.code, p.color]));
  const nameByCode = new Map(parties.map((p) => [p.code, p.name]));
  const leaderboard = Object.keys(byParty)
    .map((code) => ({
      candidateId: code, name: nameByCode.get(code) || code, party: code, color: colorByCode.get(code) || "#888888",
      ...byParty[code],
    }))
    .sort((a, b) => b.verified - a.verified || b.declared - a.declared || a.party.localeCompare(b.party));

  return NextResponse.json({
    leaderboard,
    reporting: { reported: reported.length, verified: verified.length, total: totalUnits },
    turnout: {
      accredited: turnout._sum.accreditedVoters || 0,
      cast: turnout._sum.totalVotesCast || 0,
      rejected: turnout._sum.rejectedBallots || 0,
    },
    updatedAt: new Date().toISOString(),
  });
}

// The denominator "total units" is scoped to the election's area, not the whole
// shared geography warehouse.
async function totalUnitsForScope(stateId: string | null, constituencyId: string | null): Promise<number> {
  if (constituencyId) {
    const links = await db.constituencyLga.findMany({ where: { constituencyId }, select: { lgaId: true } });
    const lgaIds = links.map((l) => l.lgaId);
    return lgaIds.length ? db.pollingUnit.count({ where: { lgaId: { in: lgaIds } } }) : 0;
  }
  if (stateId) return db.pollingUnit.count({ where: { stateId } });
  return db.pollingUnit.count();
}
