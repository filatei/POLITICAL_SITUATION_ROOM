import { NextRequest, NextResponse } from "next/server";
import { paystackValidSignature, paystackVerify } from "@/lib/payments";
import { creditPaidSeats } from "@/lib/billing-credit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!paystackValidSignature(raw, req.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let evt: any; try { evt = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  const reference = evt?.data?.reference;
  if (evt?.event === "charge.success" && reference) {
    const v = await paystackVerify(reference); // re-verify with Paystack before crediting
    if (v.ok) await creditPaidSeats(reference, v.amount);
  }
  return NextResponse.json({ ok: true });
}
