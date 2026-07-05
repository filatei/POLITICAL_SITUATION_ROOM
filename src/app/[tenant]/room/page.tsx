import type { Metadata } from "next";
import { db } from "@/lib/db";
import RoomPage from "@/app/room/page";
import TenantScope from "@/components/TenantScope";
import TenantMissing from "@/components/TenantMissing";

export const dynamic = "force-dynamic";

// Live rooms carry unverified field figures — keep them out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// /{slug}/room — tenant-scoped situation room. Unknown slug → friendly page
// (not a raw 404), sets the active-tenant cookie, then renders the room.
export default async function TenantRoom({ params }: { params: { tenant: string } }) {
  const slug = params.tenant.toLowerCase();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) return <TenantMissing slug={slug} kind="room" />;
  return <TenantScope slug={slug}><RoomPage /></TenantScope>;
}
