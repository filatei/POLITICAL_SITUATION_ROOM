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

// GET — list this tenant's admins: the creator's contact (non-removable) plus any
// extra admin emails (Google login) and phones (WhatsApp/SMS login).
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const t = await tenantForRequest();
  if (!t) return NextResponse.json({ error: "No tenant." }, { status: 404 });
  return NextResponse.json({ contactEmail: t.contactEmail, contactPhone: t.contactPhone, adminEmails: t.adminEmails, adminPhones: t.adminPhones });
}

// POST { phone } or { email } — add a tenant admin login (phone or email).
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const t = await tenantForRequest();
  if (!t) return NextResponse.json({ error: "No tenant." }, { status: 404 });
  const { phone, email } = await req.json().catch(() => ({}));

  if (email) {
    const e = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    const adminEmails = [...new Set([...(t.adminEmails || []).map((x: string) => x.toLowerCase()), e])];
    await db.tenant.update({ where: { id: t.id }, data: { adminEmails } });
    await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "admin:email-add", entity: "Tenant", entityId: t.id, meta: { email: e } } }).catch(() => {});
    return NextResponse.json({ ok: true, adminEmails });
  }

  const n = normalizeMsisdn(String(phone || ""));
  if (!n) return NextResponse.json({ error: "Enter a valid phone number or email." }, { status: 400 });
  const adminPhones = [...new Set([...(t.adminPhones || []).map((p: string) => normalizeMsisdn(p) || p), n])].filter(Boolean) as string[];
  await db.tenant.update({ where: { id: t.id }, data: { adminPhones } });
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "admin:phone-add", entity: "Tenant", entityId: t.id, meta: { phone: n } } }).catch(() => {});
  return NextResponse.json({ ok: true, adminPhones });
}

// DELETE { phone } or { email } — remove a tenant admin login.
export async function DELETE(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const t = await tenantForRequest();
  if (!t) return NextResponse.json({ error: "No tenant." }, { status: 404 });
  const { phone, email } = await req.json().catch(() => ({}));
  if (email) {
    const e = String(email).trim().toLowerCase();
    const adminEmails = (t.adminEmails || []).filter((x: string) => x.toLowerCase() !== e);
    await db.tenant.update({ where: { id: t.id }, data: { adminEmails } });
    return NextResponse.json({ ok: true, adminEmails });
  }
  const n = normalizeMsisdn(String(phone || ""));
  const adminPhones = (t.adminPhones || []).filter((p: string) => normalizeMsisdn(p) !== n);
  await db.tenant.update({ where: { id: t.id }, data: { adminPhones } });
  return NextResponse.json({ ok: true, adminPhones });
}
