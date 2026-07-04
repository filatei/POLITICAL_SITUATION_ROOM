import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { uniqueSlug, slugify, SUPER_ADMINS } from "@/lib/tenant";
import { planFor } from "@/app/api/public/scope/route";
import { sendMail } from "@/lib/mailer";
import { seedParties } from "@/lib/parties";

export const runtime = "nodejs";

const schema = z.object({
  electionName: z.string().min(3),
  electionType: z.enum(["PRESIDENTIAL", "GOVERNORSHIP", "SENATORIAL", "HOUSE_OF_REPS", "STATE_ASSEMBLY", "LG_CHAIRMANSHIP"]).default("GOVERNORSHIP"),
  slug: z.string().optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  date: z.string().optional(),
  scopeState: z.string().optional(),        // state NAME
  scopeConstituencyId: z.string().optional(),
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

  // Resolve + validate the geographic scope for this election type.
  const plan = planFor(b.electionType);
  let scopeStateId: string | null = null;
  let scopeConstituencyId: string | null = null;
  if (plan.needsState) {
    if (!b.scopeState?.trim()) return NextResponse.json({ error: "Select the state for this election." }, { status: 400 });
    const st = await db.state.findFirst({ where: { name: b.scopeState.trim().toUpperCase() } });
    if (!st) return NextResponse.json({ error: `Unknown state "${b.scopeState}".` }, { status: 400 });
    scopeStateId = st.id;
  }
  if (plan.needsConstituency) {
    if (!b.scopeConstituencyId) return NextResponse.json({ error: `Select the ${plan.constituencyLabel?.toLowerCase()}.` }, { status: 400 });
    const c = await db.constituency.findFirst({ where: { id: b.scopeConstituencyId, stateId: scopeStateId || undefined } });
    if (!c) return NextResponse.json({ error: "That constituency was not found in the selected state." }, { status: 400 });
    scopeConstituencyId = c.id;
  }

  const election = await db.election.create({
    data: {
      name: b.electionName.trim(), type: b.electionType, date: b.date ? new Date(b.date) : new Date(), status: "SETUP",
      scopeLevel: plan.level, scopeStateId, scopeConstituencyId,
    },
  });
  const tenant = await db.tenant.create({
    data: {
      slug, name: b.electionName.trim(), electionId: election.id,
      contactEmail: email, contactPhone: b.contactPhone?.trim() || null,
      adminEmails: [...new Set([email, ...SUPER_ADMINS])],
    },
  });
  await db.subscription.create({ data: { electionId: election.id } }); // 10 free seats
  await seedParties(db, election.id); // standard INEC ballot; admin trims/edits
  await db.auditLog.create({ data: { actorType: "public", action: "tenant:create", entity: "Tenant", entityId: tenant.id, meta: { slug, email } } });

  // Email the creator (now the tenant admin) their private admin + room links.
  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/+$/, "");
  const adminUrl = `${origin}/${slug}/admin`;
  const roomUrl = `${origin}/${slug}/room`;
  sendMail({
    to: email,
    subject: `Your situation room is live — ${tenant.name}`,
    text: [
      `Your ${tenant.name} situation room has been created and you are its admin.`,
      ``,
      `Admin console (keep this private): ${adminUrl}`,
      `Situation room (share with your team): ${roomUrl}`,
      ``,
      `Sign in to the admin console with this email address (${email}) to add candidates, generate agent invite codes and manage your room. You start with 10 free agent seats.`,
    ].join("\n"),
  }).catch(() => { /* non-blocking: links are also shown on-screen */ });

  return NextResponse.json({ ok: true, slug, name: tenant.name, adminPath: `/${slug}/admin`, roomPath: `/${slug}/room` });
}
