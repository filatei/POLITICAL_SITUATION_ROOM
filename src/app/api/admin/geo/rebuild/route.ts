import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRole } from "@/lib/auth";
import { savedImports, rebuildFromSaved, warehouseSummary } from "@/lib/geo-warehouse";

export const runtime = "nodejs";
export const maxDuration = 300;

// GET → list the server-side backups (states + unit counts + when saved).
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ saved: await savedImports() });
}

// POST → rebuild the whole warehouse from those backups (no file re-upload).
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await rebuildFromSaved();
    return NextResponse.json({ ok: true, result, summary: await warehouseSummary() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Rebuild failed" }, { status: 500 });
  }
}
