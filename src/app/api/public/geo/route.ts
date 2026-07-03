import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// PUBLIC, read-only view of the warehoused INEC geography (counts only — no unit
// names, no codes). Powers the landing-page showcase.
//   GET /api/public/geo            → national totals + per-state counts
//   GET /api/public/geo?state=NAME → LGAs (with ward/unit counts) for that state
export async function GET(req: NextRequest) {
  const state = new URL(req.url).searchParams.get("state");

  if (state) {
    const st = await db.state.findFirst({ where: { name: state.toUpperCase() } });
    if (!st) return NextResponse.json({ lgas: [] });
    const lgas = await db.lga.findMany({
      where: { stateId: st.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { wards: true, units: true } } },
    });
    return NextResponse.json({
      state: st.name,
      lgas: lgas.map((l) => ({ name: l.name, wards: l._count.wards, units: l._count.units })),
    });
  }

  const states = await db.state.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { lgas: true, units: true } } },
  });
  // Ward counts rolled up to states (Ward has no direct stateId).
  const [wardGroups, allLgas] = await Promise.all([
    db.ward.groupBy({ by: ["lgaId"], _count: { _all: true } }),
    db.lga.findMany({ select: { id: true, stateId: true } }),
  ]);
  const stateOfLga = new Map(allLgas.map((l) => [l.id, l.stateId]));
  const wardsByState = new Map<string, number>();
  let totalWards = 0;
  for (const w of wardGroups) {
    totalWards += w._count._all;
    const sid = stateOfLga.get(w.lgaId);
    if (sid) wardsByState.set(sid, (wardsByState.get(sid) || 0) + w._count._all);
  }

  const rows = states.map((s) => ({
    name: s.name, lgas: s._count.lgas, wards: wardsByState.get(s.id) || 0, units: s._count.units,
  }));
  return NextResponse.json({
    totals: {
      states: states.length,
      lgas: rows.reduce((n, r) => n + r.lgas, 0),
      wards: totalWards,
      units: rows.reduce((n, r) => n + r.units, 0),
    },
    states: rows,
  });
}
