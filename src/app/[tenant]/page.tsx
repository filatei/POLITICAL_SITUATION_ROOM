import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import TenantMissing from "@/components/TenantMissing";

export const dynamic = "force-dynamic";

// /{slug} — the bare tenant link (as shared on WhatsApp etc.). Unknown slug →
// friendly page (not a raw 404); otherwise send visitors to the situation room.
export default async function TenantHome({ params }: { params: { tenant: string } }) {
  const slug = params.tenant.toLowerCase();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) return <TenantMissing slug={slug} kind="room" />;
  redirect(`/${slug}/room`);
}
