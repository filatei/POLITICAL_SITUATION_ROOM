import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { presenceListFor, presenceCountFor } from "@/lib/realtime";
import { scopedElection } from "@/lib/election-scope";

export const runtime = "nodejs";

// The room's live roster for ITS OWN election:
//   online  — agents holding a live socket right now
//   active  — agents seen (heartbeat/report) within the last 3 minutes, even if
//             their socket briefly dropped (Cloudflare idles sockets ~100s)
//   total   — all agent codes issued for this election
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR", "ANALYST"]))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const election = await scopedElection();
  if (!election) return NextResponse.json({ online: [], count: 0, active: [], activeCount: 0, totalAgents: 0 });

  const online = presenceListFor(election.id);
  const onlineIds = new Set(online.map((p) => p.agentId));

  const cutoff = new Date(Date.now() - 3 * 60 * 1000);
  const recent = await db.agent.findMany({
    where: { electionId: election.id, lastSeenAt: { gte: cutoff } },
    include: { pollingUnit: { include: { ward: true, lga: true } } },
    orderBy: { lastSeenAt: "desc" },
    take: 500,
  });
  const active = recent.map((a) => ({
    agentId: a.id, name: a.name,
    unitLabel: a.pollingUnit ? `${a.pollingUnit.name} · ${a.pollingUnit.ward.name} · ${a.pollingUnit.lga.name}` : null,
    lastSeenAt: a.lastSeenAt,
    live: onlineIds.has(a.id),
  }));

  const totalAgents = await db.agent.count({ where: { electionId: election.id } });
  return NextResponse.json({
    online, count: presenceCountFor(election.id),
    active, activeCount: active.length,
    totalAgents,
  });
}
