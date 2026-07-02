import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setOtp } from "@/lib/otp";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { phone } = await req.json();
  const p = String(phone || "").trim();
  if (!p) return NextResponse.json({ error: "Phone required." }, { status: 400 });

  const agent = await db.agent.findFirst({ where: { phone: p } });
  const user = agent ? null : await db.user.findFirst({ where: { email: p } });
  if (!agent && !user)
    return NextResponse.json({ error: "No account for this phone." }, { status: 404 });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  setOtp(p, code);
  await sendSms(p, `Situation Room login code: ${code} (valid 5 min).`);
  return NextResponse.json({ ok: true });
}
