import { db } from "@/lib/db";
import AdminPage from "@/app/admin/page";
import TenantScope from "@/components/TenantScope";
import TenantMissing from "@/components/TenantMissing";

export const dynamic = "force-dynamic";

// /{slug}/admin — tenant-scoped admin console. Unknown slug → friendly page
// (not a raw 404), sets the active-tenant cookie, then renders the console.
export default async function TenantAdmin({ params }: { params: { tenant: string } }) {
  const slug = params.tenant.toLowerCase();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) return <TenantMissing slug={slug} kind="admin" />;
  return <TenantScope slug={slug}><AdminPage /></TenantScope>;
}
