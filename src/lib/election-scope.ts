import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Resolve the election a request may act on — and ENFORCE tenant isolation.
//
// Authority comes from the SESSION, never from the client-set `psr_tenant`
// cookie alone:
//   • Agents are pinned to their own election (token electionId); cookie ignored.
//   • Staff pinned to an election (tenant admins/staff) only ever get their own
//     election, even if the cookie points elsewhere.
//   • Super-admins / unpinned staff (electionId null) may follow the cookie to
//     administer any tenant; falling back to the latest election otherwise.
export async function scopedElection() {
  const s = await getSession();

  // Agent: hard-pinned to the election in their token.
  if (s?.kind === "agent" && s.electionId) {
    return db.election.findUnique({ where: { id: s.electionId } });
  }

  // The tenant the cookie is asking for (if any).
  let requested: Awaited<ReturnType<typeof db.election.findUnique>> | null = null;
  try {
    const slug = cookies().get("psr_tenant")?.value;
    if (slug) {
      const t = await db.tenant.findUnique({ where: { slug: slug.toLowerCase() }, include: { election: true } });
      requested = t?.election ?? null;
    }
  } catch { /* cookies() unavailable here */ }

  // Staff pinned to a tenant: only their own election is ever returned.
  if (s?.kind === "user" && s.electionId) {
    if (requested && requested.id === s.electionId) return requested;
    return db.election.findUnique({ where: { id: s.electionId } });
  }

  // Super-admin / unpinned: honour the requested tenant, else latest election.
  if (requested) return requested;
  return db.election.findFirst({ orderBy: { createdAt: "desc" } });
}
