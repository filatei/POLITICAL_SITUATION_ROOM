import { scopedElection } from "@/lib/election-scope";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const election = await scopedElection();
  if (!election) return NextResponse.json({ error: "No election configured." }, { status: 404 });

  // Pinned staff always resolve to THEIR own election, ignoring the URL tenant.
  // If the URL (psr_tenant cookie) points to a different election, flag it so the
  // room can tell the user rather than silently showing an empty/other election.
  let tenantMismatch: { requested: string; yours: string } | null = null;
  try {
    const slug = cookies().get("psr_tenant")?.value?.toLowerCase();
    if (slug) {
      const reqT = await db.tenant.findUnique({ where: { slug }, include: { election: { select: { id: true, name: true } } } });
      if (reqT?.election && reqT.election.id !== election.id) {
        tenantMismatch = { requested: reqT.election.name || reqT.name, yours: election.name };
      }
    }
  } catch { /* cookies() unavailable */ }

  const candidates = await db.candidate.findMany({
    where: { electionId: election.id },
    include: { party: true },
    orderBy: { party: { code: "asc" } },
  });
  const cand = candidates.map((c) => ({
    id: c.id, name: c.name, party: c.party.code, partyName: c.party.name, color: c.party.color,
  }));

  if (s.kind === "agent") {
    const agent = await db.agent.findUnique({
      where: { id: s.sub },
      include: { pollingUnit: { include: { ward: true, lga: true, state: true } } },
    });
    const unit = agent?.pollingUnit
      ? { id: agent.pollingUnit.id, name: agent.pollingUnit.name,
          registeredVoters: agent.pollingUnit.registeredVoters,
          label: `${agent.pollingUnit.name} · ${agent.pollingUnit.ward.name} · ${agent.pollingUnit.lga.name} · ${agent.pollingUnit.state.name}` }
      : null;
    return NextResponse.json({ election: { id: election.id, name: election.name, type: election.type, status: election.status }, candidates: cand, unit });
  }

  const totalUnits = await db.pollingUnit.count();
  const parties = await db.party.findMany({ where: { electionId: election.id } });
  return NextResponse.json({
    election: { id: election.id, name: election.name, type: election.type, status: election.status },
    candidates: cand,
    parties: parties.map((p) => ({ code: p.code, name: p.name, color: p.color })),
    totalUnits,
    tenantMismatch,
  });
}
