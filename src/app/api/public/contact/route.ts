import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendMail, mailEnabled, CONTACT_TO } from "@/lib/mailer";

export const runtime = "nodejs";

let hits: number[] = [];
function limited(): boolean {
  const now = Date.now();
  hits = hits.filter((t) => now - t < 60_000);
  if (hits.length >= 20) return true;
  hits.push(now);
  return false;
}

export async function POST(req: NextRequest) {
  if (limited()) return NextResponse.json({ error: "Too many messages — try again shortly." }, { status: 429 });
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
