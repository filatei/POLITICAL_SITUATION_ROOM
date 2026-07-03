import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import AdminPage from "@/app/admin/page";
import TenantScope from "@/components/TenantScope";

export const dynamic = "force-dynamic";

// /{slug}/admin — tenant-scoped admin console. Validates the slug (404 if unknown),
// sets the active-tenant cookie, then renders the standard admin console.
export default async function TenantAdmin({ params }: { params: { tenant: string } }) {
  const slug = params.tenant.toLowerCase();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();
  return <TenantScope slug={slug}><AdminPage /></TenantScope>;
}
