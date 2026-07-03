import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRole } from "@/lib/auth";
import { importUnits, warehouseSummary, RawUnit } from "@/lib/geo-warehouse";

export const runtime = "nodejs";
export const maxDuration = 300;

// Import a harvested state file (from scripts/harvest-inec.mjs). Accepts either the
// full file shape { state, units:[...] } or { state, units } with units carrying
// lga/ward/delim. ADMIN-gated. Used because the server itself can't reach INEC.
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { state?: string; units?: RawUnit[]; replace?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const state = String(body?.state || "").toUpperCase().trim();
  const units = Array.isArray(body?.units) ? body.units : [];
  if (!state) return NextResponse.json({ error: "Missing 'state' in file" }, { status: 400 });
  if (!units.length) return NextResponse.json({ error: "No 'units' array in file" }, { status: 400 });

  try {
    const result = await importUnits(state, units, !!body.replace);
    return NextResponse.json({ ok: true, result, summary: await warehouseSummary() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Import failed" }, { status: 500 });
  }
}
