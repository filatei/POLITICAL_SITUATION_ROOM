import { db } from "@/lib/db";
import { normalizeMsisdn } from "@/lib/sms";

export type AdminMatch = { email: string; name: string; electionId: string; isSuper: false };

// Resolve a phone number to a TENANT admin identity — the tenant whose contact
// phone (captured at room creation) matches. Super-admins are intentionally
// excluded: they sign in with Google only. Returns null if not a tenant admin.
export async function resolveAdminByPhone(phone: string): Promise<AdminMatch | null> {
  const n = normalizeMsisdn(phone);
  if (!n) return null;

  const tenants = await db.tenant.findMany({
    where: { contactEmail: { not: null } },
    select: { contactPhone: true, adminPhones: true, contactEmail: true, name: true, electionId: true },
  });
  for (const t of tenants) {
    // Match the tenant's contact phone OR any extra admin phone. Compare on the
    // normalised value so 0803… and +234803… both resolve.
    const phones = [t.contactPhone, ...(t.adminPhones || [])];
    if (phones.some((p) => normalizeMsisdn(p) === n)) {
      return { email: (t.contactEmail as string).toLowerCase(), name: t.name, electionId: t.electionId, isSuper: false };
    }
  }
  return null;
}
