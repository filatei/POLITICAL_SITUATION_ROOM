import { NextRequest, NextResponse } from "next/server";
import { paystackVerify, squadVerify } from "@/lib/payments";
import { creditPaidSeats } from "@/lib/billing-credit";

export const runtime = "nodejs";

// Where the provider redirects the buyer after payment. We verify server-side
// (the webhook is the source of truth, but this makes the redirect reliable) and
// bounce back to the admin console with a status flag.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref") || url.searchParams.get("reference") || url.searchParams.get("transaction_ref");
  const provider = (url.searchParams.get("provider") || "PAYSTACK").toUpperCase();
  const appUrl = process.env.APP_URL || url.origin;

  let paid = false;
  if (ref) {
    const v = provider === "SQUAD" ? await squadVerify(ref) : await paystackVerify(ref);
    if (v.ok) { const c = await creditPaidSeats(ref, v.amount); paid = c.ok; }
  }
  return NextResponse.redirect(`${appUrl}/admin?billing=${paid ? "success" : "pending"}`);
}
