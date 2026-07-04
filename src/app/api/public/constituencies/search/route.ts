import { NextRequest, NextResponse } from "next/server";
import { searchConstituencies } from "@/lib/constituencies";

export const runtime = "nodejs";

// PUBLIC typeahead over senatorial districts, federal + state constituencies by
// name or INEC code. Powers "find my constituency" and is a stable third-party
// endpoint. q must be >= 2 chars.
export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ q, results: [] });
  return NextResponse.json({ q, results: await searchConstituencies(q) });
}
