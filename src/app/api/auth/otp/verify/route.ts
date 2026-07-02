import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkOtp } from "@/lib/otp";
import { withToken } from "@/lib/respond";
import type { Session } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { phone, code } = await req.json();
  const p = String(phone || "").trim();
  if (!checkOtp(p, String(code || "")))
    return NextResponse.json({ error: "Invalid or expired code." }, { status: 401 });

  const agent = await db.agent.findFirst({
    where: { phone: p },
    include: { pollingUnit: { include: { ward: true, lga: true, state: true } } },
  });
  if (agent) {
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
  const user = await db.user.findFirst({ where: { email: p } });
  if (!user) return NextResponse.json({ error: "No account." }, { status: 404 });
  const session: Session = { sub: user.id, kind: "user", name: user.name, role: user.role, scope: "NATIONAL" };
  return withToken(session);
}
