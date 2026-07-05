import type { Metadata } from "next";
import { db } from "@/lib/db";
import AgentHome from "@/app/agent/page";
import TenantScope from "@/components/TenantScope";
import TenantMissing from "@/components/TenantMissing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// /{slug}/agent — the field-agent app, scoped to this tenant. Unknown slug →
// friendly page (not a raw 404), sets the active-tenant cookie, then renders the
// agent app (which sends the visitor to /{slug}/agent/login if not signed in).
export default async function TenantAgent({ params }: { params: { tenant: string } }) {
  const slug = params.tenant.toLowerCase();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) return <TenantMissing slug={slug} kind="agent" />;
  return <TenantScope slug={slug}><AgentHome /></TenantScope>;
}
