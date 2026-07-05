import { scopedElection } from "@/lib/election-scope";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { normalizeMsisdn } from "@/lib/sms";

export const runtime = "nodejs";

async function tenantForRequest() {
  const election = await scopedElection();
  if (!election) return null;
  return db.tenant.findUnique({ where: { electionId: election.id } });
}

// GET — list this tenant's admin phones (contact phone + extra admin phones).
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const t = await tenantForRequest();
  if (!t) return NextResponse.json({ error: "No tenant." }, { status: 404 });
  return NextResponse.json({ contactPhone: t.contactPhone, adminPhones: t.adminPhones });
}

// POST { phone } — add an admin phone. DELETE { phone } — remove one.
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const t = await tenantForRequest();
  if (!t) return NextResponse.json({ error: "No tenant." }, { status: 404 });
  const { phone } = await req.json().catch(() => ({}));
  const n = normalizeMsisdn(String(phone || ""));
  if (!n) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  const set = new Set([...(t.adminPhones || []).map((p) => normalizeMsisdn(p) || p), n]);
  const adminPhones = [...set].filter(Boolean) as string[];
  await db.tenant.update({ where: { id: t.id }, data: { adminPhones } });
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "admin:phone-add", entity: "Tenant", entityId: t.id, meta: { phone: n } } }).catch(() => {});
  return NextResponse.json({ ok: true, adminPhones });
}

export async function DELETE(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const t = await tenantForRequest();
  if (!t) return NextResponse.json({ error: "No tenant." }, { status: 404 });
  const { phone } = await req.json().catch(() => ({}));
  const n = normalizeMsisdn(String(phone || ""));
  const adminPhones = (t.adminPhones || []).filter((p) => normalizeMsisdn(p) !== n);
  await db.tenant.update({ where: { id: t.id }, data: { adminPhones } });
  return NextResponse.json({ ok: true, adminPhones });
}
