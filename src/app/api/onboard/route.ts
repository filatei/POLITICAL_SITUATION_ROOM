import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { uniqueSlug, slugify, SUPER_ADMINS } from "@/lib/tenant";

export const runtime = "nodejs";

const schema = z.object({
  electionName: z.string().min(3),
  electionType: z.enum(["PRESIDENTIAL", "GOVERNORSHIP", "SENATORIAL", "HOUSE_OF_REPS", "STATE_ASSEMBLY", "LG_CHAIRMANSHIP"]).default("GOVERNORSHIP"),
  slug: z.string().optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  date: z.string().optional(),
});

let hits: number[] = [];
function limited() {
  const now = Date.now();
  hits = hits.filter((t) => now - t < 3600_000);
  if (hits.length >= 30) return true; // 30 new tenants/hour, platform-wide
  hits.push(now);
  return false;
}

// Public onboarding: create a tenant (= one election situation room) with 10 free
// seats. The creator's email becomes the tenant admin (plus platform super-admins).
export async function POST(req: NextRequest) {
  if (limited()) return NextResponse.json({ error: "Too many sign-ups right now — try again shortly." }, { status: 429 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;

  const wanted = b.slug ? slugify(b.slug) : slugify(b.electionName);
  const slug = await uniqueSlug(wanted);
  const email = b.contactEmail.trim().toLowerCase();

  const election = await db.election.create({
    data: { name: b.electionName.trim(), type: b.electionType, date: b.date ? new Date(b.date) : new Date(), status: "SETUP" },
  });
  const tenant = await db.tenant.create({
    data: {
      slug, name: b.electionName.trim(), electionId: election.id,
      contactEmail: email, contactPhone: b.contactPhone?.trim() || null,
      adminEmails: [...new Set([email, ...SUPER_ADMINS])],
    },
  });
  await db.subscription.create({ data: { electionId: election.id } }); // 10 free seats
  await db.auditLog.create({ data: { actorType: "public", action: "tenant:create", entity: "Tenant", entityId: tenant.id, meta: { slug, email } } });

  return NextResponse.json({ ok: true, slug, name: tenant.name, adminPath: `/${slug}/admin`, roomPath: `/${slug}/room` });
}
