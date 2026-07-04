import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import AgentHome from "@/app/agent/page";
import TenantScope from "@/components/TenantScope";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// /{slug}/agent — the field-agent app, scoped to this tenant. Validates the slug,
// sets the active-tenant cookie, then renders the agent app (which sends the
// visitor to /{slug}/agent/login if they aren't signed in).
export default async function TenantAgent({ params }: { params: { tenant: string } }) {
  const slug = params.tenant.toLowerCase();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();
  return <TenantScope slug={slug}><AgentHome /></TenantScope>;
}
