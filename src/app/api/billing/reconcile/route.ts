import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRole } from "@/lib/auth";
import { reconcilePending } from "@/lib/billing-credit";

export const runtime = "nodejs";

// Verify pending payments directly with Paystack/Squad and credit any that paid.
// Safe to call on a shared merchant whose single webhook lives in another app.
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await reconcilePending(40);
  return NextResponse.json({ ok: true, ...r });
}
