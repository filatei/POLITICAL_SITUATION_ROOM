import { NextRequest, NextResponse } from "next/server";
import { normalizeMsisdn } from "@/lib/sms";
import { authStart } from "@/lib/torama-auth";

export const runtime = "nodejs";

// POST { phone, deviceId } — ask Torama Auth to send an OTP for admin login.
// Generic response (no enumeration of which numbers are admins).
export async function POST(req: NextRequest) {
  const { phone, deviceId } = await req.json().catch(() => ({}));
  const n = normalizeMsisdn(String(phone || ""));
  if (!n || !deviceId) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  const r = await authStart(n, String(deviceId));
  if (!r.ok) return NextResponse.json({ error: r.error || "Could not send a code." }, { status: 502 });
  return NextResponse.json({ ok: true, step: r.step ?? "otp" });
}
