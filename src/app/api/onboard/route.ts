import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { uniqueSlug, slugify, SUPER_ADMINS } from "@/lib/tenant";
import { planFor } from "@/app/api/public/scope/route";
import { sendMail } from "@/lib/mailer";
import { seedParties } from "@/lib/parties";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { freeSeatsFor } from "@/lib/free-tier";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// Rich, branded welcome email (table-based layout for broad mail-client support).
function onboardEmailHtml(o: { name: string; adminUrl: string; roomUrl: string; email: string; freeSeats: number; origin: string }): string {
  const name = esc(o.name);
  const seats = o.freeSeats.toLocaleString();
  const logo = `${o.origin}/PSR_LOGO.jpeg`;
  const ink = "#0b1220", accent = "#16a34a", muted = "#6b7280", line = "#e5e7eb", bg = "#f4f6f8";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:24px 12px;"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${line};border-radius:16px;overflow:hidden;">
    <!-- Header band -->
    <tr><td style="background:${ink};padding:26px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td align="left" style="vertical-align:middle;">
          <img src="${logo}" width="44" height="44" alt="PSR" style="display:inline-block;vertical-align:middle;border-radius:10px;background:#fff;">
          <span style="display:inline-block;vertical-align:middle;margin-left:12px;color:#fff;font-size:20px;font-weight:800;letter-spacing:.5px;">PSR</span>
        </td>
        <td align="right" style="vertical-align:middle;">
          <span style="display:inline-block;background:${accent};color:#fff;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;padding:6px 12px;border-radius:999px;">Room Live</span>
        </td>
      </tr></table>
    </td></tr>

    <!-- Hero -->
    <tr><td style="padding:36px 32px 8px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${accent};">Political Situation Room</div>
      <h1 style="margin:8px 0 6px;font-size:26px;line-height:1.25;font-weight:800;color:${ink};">${name} is live</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:${muted};">Your situation room has been created and you are its <strong style="color:${ink};">admin</strong>. Everything you need to run real-time, agent-verified monitoring is ready below.</p>
    </td></tr>

    <!-- Link cards -->
    <tr><td style="padding:24px 32px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${line};border-radius:12px;">
        <tr><td style="padding:18px 20px;border-bottom:1px solid ${line};">
          <div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${muted};">🔒 Admin console — keep private</div>
          <a href="${o.adminUrl}" style="display:inline-block;margin-top:8px;font-size:15px;font-weight:700;color:${accent};text-decoration:none;word-break:break-all;">${esc(o.adminUrl)}</a>
        </td></tr>
        <tr><td style="padding:18px 20px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${muted};">📡 Situation room — share with your team</div>
          <a href="${o.roomUrl}" style="display:inline-block;margin-top:8px;font-size:15px;font-weight:700;color:${accent};text-decoration:none;word-break:break-all;">${esc(o.roomUrl)}</a>
        </td></tr>
      </table>
    </td></tr>

    <!-- CTA button -->
    <tr><td style="padding:22px 32px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-radius:10px;background:${accent};">
        <a href="${o.adminUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Open your admin console →</a>
      </td></tr></table>
    </td></tr>

    <!-- Getting started -->
    <tr><td style="padding:20px 32px 8px;">
      <div style="font-size:13px;font-weight:700;color:${ink};margin-bottom:10px;">Getting started</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5;color:${muted};">
        <tr><td style="padding:5px 0;"><span style="color:${accent};font-weight:800;">1.</span>&nbsp; Sign in with <strong style="color:${ink};">${esc(o.email)}</strong></td></tr>
        <tr><td style="padding:5px 0;"><span style="color:${accent};font-weight:800;">2.</span>&nbsp; Add your candidates / parties to the ballot</td></tr>
        <tr><td style="padding:5px 0;"><span style="color:${accent};font-weight:800;">3.</span>&nbsp; Generate agent invite codes and share the links</td></tr>
        <tr><td style="padding:5px 0;"><span style="color:${accent};font-weight:800;">4.</span>&nbsp; Watch results stream into your situation room live</td></tr>
      </table>
    </td></tr>

    <!-- Free tier callout -->
    <tr><td style="padding:16px 32px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf3;border:1px solid #bbf7d0;border-radius:12px;">
        <tr><td style="padding:16px 20px;">
          <span style="font-size:22px;font-weight:800;color:${accent};">${seats}</span>
          <span style="font-size:14px;color:#166534;font-weight:600;"> free agent codes included</span>
          <div style="font-size:13px;color:#166534;margin-top:2px;">That's 20 per LGA across your area — no card required to start.</div>
        </td></tr>
      </table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:22px 32px;background:#fafafa;border-top:1px solid ${line};">
      <div style="font-size:12px;line-height:1.6;color:${muted};">
        <strong style="color:${ink};">Political Situation Room</strong> — real-time, agent-verified election monitoring.<br>
        <a href="${o.origin}" style="color:${accent};text-decoration:none;">${esc(o.origin.replace(/^https?:\/\//, ""))}</a>
        &nbsp;·&nbsp; A <a href="https://torama.money" style="color:${muted};text-decoration:none;">Torama</a> platform
      </div>
      <div style="font-size:11px;color:#9ca3af;margin-top:10px;">You received this because a situation room was created with this email address. Keep your admin link private.</div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

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

// Public onboarding: create a tenant (= one election situation room). The
// creator's email becomes the tenant admin (plus platform super-admins).
export async function POST(req: NextRequest) {
  // Per-IP (5/hour) + a platform-wide safety cap (30/hour).
  if (!rateLimit(`onboard:${clientIp(req)}`, 5, 3600_000) || !rateLimit("onboard:_global", 30, 3600_000))
    return NextResponse.json({ error: "Too many sign-ups right now — try again shortly." }, { status: 429 });
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
  const freeSeats = await freeSeatsFor({ scopeStateId, scopeConstituencyId });
  await db.subscription.create({ data: { electionId: election.id, freeSeats } });
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
      `Sign in to the admin console with this email address (${email}) to add candidates, generate agent invite codes and manage your room. You start with ${freeSeats.toLocaleString()} free agent codes (20 per LGA across your area).`,
      ``,
      `Political Situation Room — real-time, agent-verified election monitoring.`,
      `${origin}`,
    ].join("\n"),
    html: onboardEmailHtml({ name: tenant.name, adminUrl, roomUrl, email, freeSeats, origin }),
  }).catch(() => { /* non-blocking: links are also shown on-screen */ });

  return NextResponse.json({ ok: true, slug, name: tenant.name, adminPath: `/${slug}/admin`, roomPath: `/${slug}/room` });
}
