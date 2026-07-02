import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { withToken } from "@/lib/respond";
import type { Session } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { inviteCode, pin } = await req.json();
  if (!inviteCode || !pin || String(pin).length < 4)
    return NextResponse.json({ error: "Invite code and a 4+ digit PIN are required." }, { status: 400 });

  const agent = await db.agent.findUnique({
    where: { inviteCode: String(inviteCode).trim().toUpperCase() },
    include: { pollingUnit: { include: { ward: true, lga: true, state: true } } },
  });
  if (!agent) return NextResponse.json({ error: "Invalid invite code." }, { status: 401 });
  if (agent.status === "SUSPENDED")
    return NextResponse.json({ error: "This agent is suspended." }, { status: 403 });

  // First use: claim the invite and set the PIN. Later uses: verify the PIN.
  if (!agent.pinHash) {
    await db.agent.update({
      where: { id: agent.id },
      data: { pinHash: await bcrypt.hash(String(pin), 10), inviteUsedAt: new Date(), status: "ACTIVE" },
    });
  } else {
    const ok = await bcrypt.compare(String(pin), agent.pinHash);
    if (!ok) return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
  }

  const session: Session = {
    sub: agent.id,
    kind: "agent",
    name: agent.name,
    role: "AGENT",
    scope: agent.scope,
    unitId: agent.pollingUnitId,
    electionId: agent.electionId,
  };
  const unit = agent.pollingUnit
    ? {
        id: agent.pollingUnit.id,
        name: agent.pollingUnit.name,
        label: `${agent.pollingUnit.name} · ${agent.pollingUnit.ward.name} · ${agent.pollingUnit.lga.name} · ${agent.pollingUnit.state.name}`,
      }
    : null;
  return withToken(session, { unit });
}
