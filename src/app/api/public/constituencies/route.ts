import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listConstituencies, constituencySummary, CType } from "@/lib/constituencies";

export const runtime = "nodejs";

// PUBLIC read API over the INEC electoral-constituency warehouse.
//   (no params)            -> totals by type + per-state breakdown
//   ?state=ONDO            -> that state's senatorial + federal + state lists
//   ?state=ONDO&type=SENATORIAL -> just one type (with LGA/ward composition)
// Names only — safe to expose. Powers the landing search and third-party use.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const type = (url.searchParams.get("type") || "").toUpperCase();

  if (!state) {
    const summary = await constituencySummary();
    const perState = await db.constituency.groupBy({
      by: ["stateId", "type"], _count: { _all: true },
    });
    const states = await db.state.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    const byState = states.map((s) => {
      const rows = perState.filter((r) => r.stateId === s.id);
      const get = (t: string) => rows.find((r) => r.type === t)?._count._all || 0;
      return { state: s.name, senatorial: get("SENATORIAL"), federal: get("FEDERAL"), state_constituencies: get("STATE") };
    });
    return NextResponse.json({ totals: summary.byType, states: byState });
  }

  if (type === "SENATORIAL" || type === "FEDERAL" || type === "STATE") {
    return NextResponse.json({ state, type, items: await listConstituencies(state, type as CType) });
  }
  // No type: return all three for the state.
  const [senatorial, federal, stateC] = await Promise.all([
    listConstituencies(state, "SENATORIAL"),
    listConstituencies(state, "FEDERAL"),
    listConstituencies(state, "STATE"),
  ]);
  return NextResponse.json({ state, senatorial, federal, state_constituencies: stateC });
}
