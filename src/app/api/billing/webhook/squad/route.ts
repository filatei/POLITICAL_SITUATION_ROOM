import { NextRequest, NextResponse } from "next/server";
import { squadValidSignature, squadVerify } from "@/lib/payments";
import { creditPaidSeats } from "@/lib/billing-credit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  // Squad signs the payload with an HMAC-SHA512 of the raw body using the secret key.
  if (!squadValidSignature(raw, req.headers.get("x-squad-signature") || req.headers.get("x-squad-encrypted-body"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let evt: any; try { evt = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  const d = evt?.Body || evt?.data || evt;
  const reference = d?.transaction_ref || d?.transactionRef;
  const success = String(d?.transaction_status || evt?.Event || "").toLowerCase().includes("success");
  if (reference && success) {
    const v = await squadVerify(reference);
    if (v.ok) await creditPaidSeats(reference, v.amount);
  }
  return NextResponse.json({ ok: true });
}
