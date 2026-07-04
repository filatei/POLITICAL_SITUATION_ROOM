import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Typeahead search across the warehoused geography: polling units, wards, LGAs.
// Public (names only) — powers the landing "find your polling unit" and the admin
// geo search. Returns the full State › LGA › Ward › Unit path for each hit.
export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ q, results: [] });

  const [units, wards, lgas] = await Promise.all([
    db.pollingUnit.findMany({ where: { name: { contains: q, mode: "insensitive" } }, take: 20, include: { ward: true, lga: true, state: true } }),
    db.ward.findMany({ where: { name: { contains: q, mode: "insensitive" } }, take: 8, include: { lga: { include: { state: true } } } }),
    db.lga.findMany({ where: { name: { contains: q, mode: "insensitive" } }, take: 8, include: { state: true } }),
  ]);

  const results = [
    ...units.map((u) => ({ type: "unit" as const, id: u.id, name: u.name, ward: u.ward.name, lga: u.lga.name, state: u.state.name, code: u.code })),
    ...wards.map((w) => ({ type: "ward" as const, id: w.id, name: w.name, lga: w.lga.name, state: w.lga.state.name })),
    ...lgas.map((l) => ({ type: "lga" as const, id: l.id, name: l.name, state: l.state.name })),
  ];
  return NextResponse.json({ q, results });
}
