import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendMail, mailEnabled, CONTACT_TO } from "@/lib/mailer";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // 5 messages / 10 min per IP + a global cap.
  if (!rateLimit(`contact:${clientIp(req)}`, 5, 600_000) || !rateLimit("contact:_global", 60, 60_000))
    return NextResponse.json({ error: "Too many messages — try again shortly." }, { status: 429 });
  const { name, email, message } = await req.json();
  const n = String(name || "").trim().slice(0, 120);
  const e = String(email || "").trim().slice(0, 160);
  const m = String(message || "").trim().slice(0, 4000);
  if (!n || !e || !m || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
    return NextResponse.json({ error: "Please provide your name, a valid email and a message." }, { status: 400 });
  }
  // No subject field on the form: derive one from the sender's email + the site host.
  const host = req.headers.get("host") || new URL(req.url).host;
  const sub = `Contact from ${e} · ${host}`;
  await db.contactMessage.create({ data: { name: n, email: e, subject: sub, message: m } });

  // Email us the enquiry (best-effort — the DB copy is the source of truth).
  if (mailEnabled) {
    try {
      await sendMail({
        to: CONTACT_TO,
        replyTo: e,
        subject: sub,
        text: `From: ${n} <${e}>\nSite: ${host}\n\n${m}\n\n— sent from the ${host} contact form`,
      });
    } catch { /* delivered later from the stored copy if SMTP hiccups */ }
  }
  return NextResponse.json({ ok: true });
}
