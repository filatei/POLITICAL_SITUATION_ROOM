import { cookies } from "next/headers";
import { db } from "@/lib/db";

// Resolve the "active" election for a request. When a tenant path (/{slug}/room|admin)
// has been visited, a `psr_tenant` cookie scopes API calls to that tenant's election;
// otherwise we fall back to the most recent election (single-tenant behaviour).
export async function scopedElection() {
  try {
    const slug = cookies().get("psr_tenant")?.value;
    if (slug) {
      const t = await db.tenant.findUnique({ where: { slug: slug.toLowerCase() }, include: { election: true } });
      if (t?.election) return t.election;
    }
  } catch { /* cookies() not available in this context — fall through */ }
  return db.election.findFirst({ orderBy: { createdAt: "desc" } });
}
