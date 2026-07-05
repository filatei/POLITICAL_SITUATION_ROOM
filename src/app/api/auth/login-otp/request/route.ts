import { NextRequest, NextResponse } from "next/server";
import { resolveAdminByPhone } from "@/lib/admin-phone";
import { issueLoginOtp } from "@/lib/login-otp";
import { sendWhatsAppOtp, whatsappOtpEnabled } from "@/lib/whatsapp";
import { sendSms, smsEnabled } from "@/lib/sms";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// POST { phone } → if the number belongs to an admin, send a login code over
// WhatsApp (falling back to SMS). Always returns a generic response so the
// endpoint can't be used to enumerate which numbers are admins.
export async function POST(req: NextRequest) {
  const { phone } = await req.json().catch(() => ({}));
  const generic = NextResponse.json({ ok: true, sent: true, message: "If that number is an admin, a code is on its way." });

  if (!phone || !rateLimit(`otp:${clientIp(req)}`, 5, 60_000)) return generic;

  const match = await resolveAdminByPhone(String(phone));
  if (!match) return generic; // don't reveal non-admin numbers

  const issued = await issueLoginOtp(String(phone));
  if (!issued) return generic;

  const message = `${issued.code} is your PSR admin login code. Valid 5 minutes. Do not share it.`;
  // Deliver on BOTH channels so the admin gets it wherever they look.
  let waResult: { ok: boolean; error?: string } = { ok: false, error: "whatsapp-otp-disabled" };
  if (whatsappOtpEnabled) { try { waResult = await sendWhatsAppOtp(issued.phone, issued.code); } catch (e: any) { waResult = { ok: false, error: String(e?.message || e) }; } }
  if (smsEnabled) { try { await sendSms(issued.phone, message); } catch { /* ignore */ } }

  // Diagnostics only when explicitly enabled — never leaks in normal operation.
  if (process.env.OTP_DEBUG === "true") {
    return NextResponse.json({ ok: true, debug: { whatsappOtpEnabled, whatsapp: waResult } });
  }
  return generic;
}
