import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
  const { name, email, subject, message } = await req.json();
  const n = String(name || "").trim().slice(0, 120);
  const e = String(email || "").trim().slice(0, 160);
  const m = String(message || "").trim().slice(0, 4000);
  if (!n || !e || !m || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
    return NextResponse.json({ error: "Please provide your name, a valid email and a message." }, { status: 400 });
  }
  await db.contactMessage.create({ data: { name: n, email: e, subject: String(subject || "").trim().slice(0, 200) || null, message: m } });
  return NextResponse.json({ ok: true });
}
