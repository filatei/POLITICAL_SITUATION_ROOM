import { db } from "@/lib/db";
import { normalizeMsisdn } from "@/lib/sms";
import { SUPER_ADMINS } from "@/lib/tenant";

// Platform super-admins who may log in by phone. Env: comma list of "phone:email"
//   SUPER_ADMIN_PHONES=07067647124:owner@torama.money,07076096506:owner@torama.money
// The mapped email should also appear in SUPER_ADMINS so it resolves as global.
function superAdminPhoneMap(): Map<string, string> {
  const m = new Map<string, string>();
  const fallback = (SUPER_ADMINS[0] || "").toLowerCase();
  for (const pair of (process.env.SUPER_ADMIN_PHONES || "").split(",")) {
    const [phone, email] = pair.split(":").map((s) => s.trim());
    const n = normalizeMsisdn(phone);
    if (n) m.set(n, (email || fallback).toLowerCase());
  }
  return m;
}

export type AdminMatch = { email: string; name: string; electionId: string | null; isSuper: boolean };

// Resolve a phone to an admin identity: a platform super-admin (global), or the
// tenant whose contact phone / admin-phone list matches. Null if neither.
export async function resolveAdminByPhone(phone: string): Promise<AdminMatch | null> {
  const n = normalizeMsisdn(phone);
  if (!n) return null;

  const superEmail = superAdminPhoneMap().get(n);
  if (superEmail) return { email: superEmail, name: superEmail, electionId: null, isSuper: true };

  const tenants = await db.tenant.findMany({
    where: { contactEmail: { not: null } },
    select: { contactPhone: true, adminPhones: true, contactEmail: true, name: true, electionId: true },
  });
  for (const t of tenants) {
    const phones = [t.contactPhone, ...(t.adminPhones || [])];
    if (phones.some((p) => normalizeMsisdn(p) === n)) {
      return { email: (t.contactEmail as string).toLowerCase(), name: t.name, electionId: t.electionId, isSuper: false };
    }
  }
  return null;
}
