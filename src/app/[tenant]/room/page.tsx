import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import RoomPage from "@/app/room/page";
import TenantScope from "@/components/TenantScope";

export const dynamic = "force-dynamic";

// Live rooms carry unverified field figures — keep them out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// /{slug}/room — tenant-scoped situation room. Validates the slug (404 if unknown),
// sets the active-tenant cookie, then renders the standard room.
export default async function TenantRoom({ params }: { params: { tenant: string } }) {
  const slug = params.tenant.toLowerCase();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();
  return <TenantScope slug={slug}><RoomPage /></TenantScope>;
}
