import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// /{slug} — the bare tenant link (as shared on WhatsApp etc.). Validate the slug
// (404 if unknown) and send visitors to that tenant's situation room.
export default async function TenantHome({ params }: { params: { tenant: string } }) {
  const slug = params.tenant.toLowerCase();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();
  redirect(`/${slug}/room`);
}
