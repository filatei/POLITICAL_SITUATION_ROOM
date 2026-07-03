import { db } from "@/lib/db";

// Platform owners who can administer ANY tenant. Extendable via SUPER_ADMINS env
// (comma-separated), merged with the fixed defaults.
const DEFAULT_SUPER = ["filatei@torama.money", "filatei@gmail.com", "filatei@torama.ng", "filatei@gtsng.com"];
export const SUPER_ADMINS = [
  ...DEFAULT_SUPER,
  ...(process.env.SUPER_ADMINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
].map((s) => s.toLowerCase());

export function isSuperAdmin(email?: string | null): boolean {
  return !!email && SUPER_ADMINS.includes(email.toLowerCase());
}

export function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "tenant";
}

export async function uniqueSlug(base: string): Promise<string> {
  const s0 = slugify(base);
  let s = s0;
  for (let i = 2; i < 100; i++) {
    if (!(await db.tenant.findUnique({ where: { slug: s } }))) return s;
    s = `${s0}-${i}`;
  }
  return `${s0}-${Date.now().toString(36).slice(-4)}`;
}

export async function resolveTenant(slug: string) {
  return db.tenant.findUnique({ where: { slug: slug.toLowerCase() }, include: { election: true } });
}

// Can this signed-in email administer this tenant?
export function canAdminTenant(email: string | null | undefined, tenant: { adminEmails: string[] } | null): boolean {
  if (isSuperAdmin(email)) return true;
  if (!email || !tenant) return false;
  return tenant.adminEmails.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}

// On first boot after multi-tenancy lands, wrap the existing election in a
// default tenant so nothing is orphaned (slug: DEFAULT_TENANT_SLUG env or ondogov2027).
export async function ensureDefaultTenant() {
  const existing = await db.tenant.count();
  if (existing > 0) return { created: false };
  const election = await db.election.findFirst({ orderBy: { createdAt: "desc" } });
  if (!election) return { created: false };
  const slug = process.env.DEFAULT_TENANT_SLUG || "ondogov2027";
  await db.tenant.create({
    data: { slug, name: election.name, electionId: election.id, adminEmails: SUPER_ADMINS },
  });
  // Grandfather the platform-owner's own room with generous seats so existing
  // codes (and further testing) aren't capped by the free tier.
  const agentCount = await db.agent.count({ where: { electionId: election.id } });
  const freeSeats = Math.max(1000, agentCount + 100);
  await db.subscription.upsert({
    where: { electionId: election.id },
    update: { freeSeats },
    create: { electionId: election.id, freeSeats },
  });
  return { created: true, slug };
}
