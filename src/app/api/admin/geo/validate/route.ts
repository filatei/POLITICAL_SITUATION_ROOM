import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRole } from "@/lib/auth";
import { sessionIsSuper } from "@/lib/tenant";
import { validateWarehouse } from "@/lib/geo-validate";

export const runtime = "nodejs";

// GET → coverage report: warehoused states/LGAs/wards/units vs the canonical 774,
// with the list of short states and empty (unit-less) wards to re-harvest.
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"]) || !(await sessionIsSuper(s))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await validateWarehouse());
}
