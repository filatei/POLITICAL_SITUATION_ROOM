import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { db } from "@/lib/db";
import { withToken } from "@/lib/respond";
import type { Session } from "@/lib/auth";
import { scopedTenant, canAdminTenant } from "@/lib/tenant";

export const runtime = "nodejs";
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function POST(req: NextRequest) {
  const { credential } = await req.json();
  if (!credential) return NextResponse.json({ error: "Missing credential." }, { status: 400 });
  let email: string | undefined, name: string | undefined, sub: string | undefined;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    email = p?.email;
    name = p?.name;
    sub = p?.sub;
  } catch {
    return NextResponse.json({ error: "Google verification failed." }, { status: 401 });
  }
  if (!email) return NextResponse.json({ error: "No email in Google token." }, { status: 401 });
  const key = email.toLowerCase();

  // 1) Staff (room/admin) — matched in the User table.
  const user = await db.user.findUnique({ where: { email: key } });
  if (user) {
    if (!user.googleSub && sub) await db.user.update({ where: { id: user.id }, data: { googleSub: sub } });
    const session: Session = { sub: user.id, kind: "user", name: user.name, role: user.role, scope: "NATIONAL" };
    return withToken(session);
  }

  // 2) Field agent — Google email must be pre-profiled by an admin on the agent record.
  const agent = await db.agent.findUnique({
    where: { email: key },
    include: { pollingUnit: { include: { ward: true, lga: true, state: true } } },
  });
  if (agent) {
    if (agent.status === "SUSPENDED") return NextResponse.json({ error: "This agent is suspended." }, { status: 403 });
    await db.agent.update({ where: { id: agent.id }, data: { inviteUsedAt: agent.inviteUsedAt ?? new Date(), status: "ACTIVE" } });
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

  // 3) Tenant admin — the email listed on the tenant currently being accessed
  // (from the psr_tenant cookie). The room's creator lands here: they own the
  // room but aren't a staff User until first sign-in, when we materialise their
  // ADMIN record. Super-admins also pass canAdminTenant for any tenant.
  const tenant = await scopedTenant();
  if (tenant && canAdminTenant(key, tenant)) {
    const user = await db.user.upsert({
      where: { email: key },
      update: { googleSub: sub ?? undefined, ...(name ? { name } : {}) },
      create: { email: key, name: name || key, role: "ADMIN", googleSub: sub ?? null },
    });
    const session: Session = { sub: user.id, kind: "user", name: user.name, role: user.role, scope: "NATIONAL" };
    return withToken(session);
  }

  return NextResponse.json({ error: "This Google account is not authorized. Ask an admin to enrol your email." }, { status: 403 });
}
