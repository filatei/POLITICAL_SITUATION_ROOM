import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { costForSeats } from "@/lib/billing";
import { paystackInit, squadInit, paystackEnabled, squadEnabled } from "@/lib/payments";

export const runtime = "nodejs";

// Start a seat purchase. `seats` = number of PAID seats to buy (₦1,000 each).
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { provider, seats, email } = await req.json();
  const n = Math.max(1, Math.round(Number(seats) || 0));
  const mail = String(email || "").trim();
  if (!mail) return NextResponse.json({ error: "Billing email required." }, { status: 400 });
  if (provider === "PAYSTACK" && !paystackEnabled) return NextResponse.json({ error: "Paystack not configured (set PAYSTACK_SECRET_KEY)." }, { status: 400 });
  if (provider === "SQUAD" && !squadEnabled) return NextResponse.json({ error: "Squad not configured (set SQUAD_SECRET_KEY)." }, { status: 400 });

  const election = await db.election.findFirst({ orderBy: { createdAt: "desc" } });
  if (!election) return NextResponse.json({ error: "No election." }, { status: 404 });

  const { kobo } = costForSeats(n);
  const reference = `psr_${Date.now()}_${randomUUID().slice(0, 8)}`;
  await db.payment.create({ data: { reference, provider, electionId: election.id, seats: n, amount: kobo, email: mail, status: "PENDING", meta: { by: s!.sub } } });

  const appUrl = process.env.APP_URL || new URL(req.url).origin;
  const callbackUrl = `${appUrl}/api/billing/callback?ref=${reference}&provider=${provider}`;
  const metadata = { reference, seats: n, electionId: election.id };

  try {
    const out = provider === "SQUAD"
      ? await squadInit({ email: mail, amountKobo: kobo, reference, callbackUrl, metadata })
      : await paystackInit({ email: mail, amountKobo: kobo, reference, callbackUrl, metadata });
    return NextResponse.json({ ok: true, url: out.url, reference, seats: n, amountNaira: kobo / 100 });
  } catch (e: any) {
    await db.payment.update({ where: { reference }, data: { status: "FAILED" } });
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
