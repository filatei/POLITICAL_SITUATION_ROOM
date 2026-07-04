import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedElection } from "@/lib/election-scope";
import { seedParties, DEFAULT_PARTIES } from "@/lib/parties";

export const runtime = "nodejs";

// GET  -> the default INEC ballot + which codes this election already has.
// POST -> add any missing default parties to the current (scoped) election.
// ADMIN-gated. Safe to call repeatedly (existing codes are skipped).
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const election = await scopedElection();
  const have = election ? await db.party.findMany({ where: { electionId: election.id }, select: { code: true } }) : [];
  return NextResponse.json({ defaults: DEFAULT_PARTIES, present: have.map((p) => p.code) });
}

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const election = await scopedElection();
  if (!election) return NextResponse.json({ error: "No election in scope" }, { status: 404 });
  const r = await seedParties(db, election.id);
  const total = await db.party.count({ where: { electionId: election.id } });
  const candidates = await db.candidate.count({ where: { electionId: election.id } });
  return NextResponse.json({ ok: true, addedParties: r.parties, addedCandidates: r.candidates, total, candidates });
}
