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
  if (whatsappOtpEnabled) { try { await sendWhatsAppOtp(issued.phone, issued.code); } catch { /* ignore */ } }
  if (smsEnabled) { try { await sendSms(issued.phone, message); } catch { /* ignore */ } }

  return generic;
}
