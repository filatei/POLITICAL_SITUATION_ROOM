import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRole } from "@/lib/auth";
import { sessionIsSuper } from "@/lib/tenant";
import { importConstituencies, listConstituencies, constituencySummary, ConstituencyRow, CType } from "@/lib/constituencies";

export const runtime = "nodejs";
export const maxDuration = 300;

// GET  ?state=&type=  -> list constituencies for a state+type (or just the summary)
// POST { state, type, rows:[{name,code?,lgas:[...]}], replace }  -> import
// Both ADMIN-gated. Data is sourced the same way as geography (browser harvest /
// verified file), never server-fetched — INEC blocks non-browser clients.
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const type = (url.searchParams.get("type") || "").toUpperCase() as CType;
  if (state && (type === "SENATORIAL" || type === "FEDERAL")) {
    return NextResponse.json({ items: await listConstituencies(state, type) });
  }
  return NextResponse.json({ summary: await constituencySummary() });
}

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"]) || !(await sessionIsSuper(s))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { state?: string; type?: string; rows?: ConstituencyRow[]; replace?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const state = String(body?.state || "").trim();
  const type = String(body?.type || "").toUpperCase();
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!state) return NextResponse.json({ error: "Missing 'state'" }, { status: 400 });
  if (type !== "SENATORIAL" && type !== "FEDERAL") return NextResponse.json({ error: "type must be SENATORIAL or FEDERAL" }, { status: 400 });
  if (!rows.length) return NextResponse.json({ error: "No 'rows' to import" }, { status: 400 });

  try {
    const result = await importConstituencies(state, type as CType, rows, !!body.replace);
    return NextResponse.json({ ok: true, result, summary: await constituencySummary() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Import failed" }, { status: 500 });
  }
}
