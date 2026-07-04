import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRole, Session } from "@/lib/auth";
import { sessionIsSuper } from "@/lib/tenant";
import { harvestState, warehouseSummary, clearWarehouse } from "@/lib/geo-warehouse";
import { INEC_STATES } from "@/lib/inec";

export const runtime = "nodejs";
export const maxDuration = 300;

// Geography warehouse is platform-wide — super-admins only.
const allowed = async (s: Session | null): Promise<boolean> => requireRole(s, ["ADMIN"]) && (await sessionIsSuper(s));

// GET → warehouse counts + the list of harvestable states.
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!(await allowed(s))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ states: INEC_STATES, summary: await warehouseSummary() });
}

// POST { state } → warehouse that one state (idempotent). One state per call to
// stay within request limits; the client loops states for a full-country import.
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!(await allowed(s))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

// DELETE { confirm:"CLEAR" } → wipe ALL warehoused geography (detaches agent +
// submission unit links first). For a clean national re-import.
export async function DELETE(req: NextRequest) {
  const s = await getSession(req);
  if (!(await allowed(s))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { confirm } = await req.json().catch(() => ({}));
  if (confirm !== "CLEAR") return NextResponse.json({ error: "Pass { confirm: 'CLEAR' } to wipe the warehouse." }, { status: 400 });
  try {
    const removed = await clearWarehouse();
    return NextResponse.json({ ok: true, removed, summary: await warehouseSummary() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Clear failed" }, { status: 500 });
  }
}
