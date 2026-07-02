import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withToken } from "@/lib/respond";
import type { Session } from "@/lib/auth";

export const runtime = "nodejs";

// Agents sign in with their invite code alone — no PIN. Anyone holding the code
// can log in for that unit (codes are the credential; reset a code to revoke).
export async function POST(req: NextRequest) {
  const { inviteCode } = await req.json();
  if (!inviteCode) return NextResponse.json({ error: "Invite code is required." }, { status: 400 });

  const agent = await db.agent.findUnique({
    where: { inviteCode: String(inviteCode).trim().toUpperCase() },
    include: { pollingUnit: { include: { ward: true, lga: true, state: true } } },
  });
  if (!agent) return NextResponse.json({ error: "Invalid invite code." }, { status: 401 });
  if (agent.status === "SUSPENDED") return NextResponse.json({ error: "This agent is suspended." }, { status: 403 });

  await db.agent.update({
    where: { id: agent.id },
    data: { inviteUsedAt: agent.inviteUsedAt ?? new Date(), status: "ACTIVE" },
  });

  const session: Session = {
    sub: agent.id, kind: "agent", name: agent.name, role: "AGENT",
    scope: agent.scope, unitId: agent.pollingUnitId, electionId: agent.electionId,
  };
  const unit = agent.pollingUnit
    ? { id: agent.pollingUnit.id, name: agent.pollingUnit.name,
        label: `${agent.pollingUnit.name} · ${agent.pollingUnit.ward.name} · ${agent.pollingUnit.lga.name} · ${agent.pollingUnit.state.name}` }
    : null;
  return withToken(session, { unit });
}
