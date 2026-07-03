import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRole, Session } from "@/lib/auth";
import { harvestState, warehouseSummary } from "@/lib/geo-warehouse";
import { INEC_STATES } from "@/lib/inec";

export const runtime = "nodejs";
export const maxDuration = 300;

const allowed = (s: Session | null): boolean => requireRole(s, ["ADMIN"]);

// GET → warehouse counts + the list of harvestable states.
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!allowed(s)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ states: INEC_STATES, summary: await warehouseSummary() });
}

// POST { state } → warehouse that one state (idempotent). One state per call to
// stay within request limits; the client loops states for a full-country import.
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!allowed(s)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { state } = await req.json().catch(() => ({}));
  const target = String(state || "").toUpperCase().trim();
  if (!target) return NextResponse.json({ error: "state is required" }, { status: 400 });
  if (!INEC_STATES.includes(target))
    return NextResponse.json({ error: `Unknown state. One of: ${INEC_STATES.join(", ")}` }, { status: 400 });

  try {
    const result = await harvestState(target);
    return NextResponse.json({ ok: true, result, summary: await warehouseSummary() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Harvest failed" }, { status: 500 });
  }
}
