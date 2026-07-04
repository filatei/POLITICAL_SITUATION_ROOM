import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listConstituencies } from "@/lib/constituencies";

export const runtime = "nodejs";

// What scope selectors a given election type needs, and (when a state is chosen)
// the options for the second selector. Powers the onboarding form.
//   ?type=SENATORIAL&state=ONDO -> that state's senatorial districts
//   ?type=HOUSE_OF_REPS&state=ONDO -> that state's federal constituencies
export type ScopePlan = {
  level: "NATION" | "STATE" | "SENATORIAL" | "FEDERAL";
  needsState: boolean;
  needsConstituency: boolean;
  constituencyType: "SENATORIAL" | "FEDERAL" | null;
  constituencyLabel: string | null;
};

export function planFor(type: string): ScopePlan {
  switch (type) {
    case "PRESIDENTIAL":
      return { level: "NATION", needsState: false, needsConstituency: false, constituencyType: null, constituencyLabel: null };
    case "SENATORIAL":
      return { level: "SENATORIAL", needsState: true, needsConstituency: true, constituencyType: "SENATORIAL", constituencyLabel: "Senatorial district" };
    case "HOUSE_OF_REPS":
      return { level: "FEDERAL", needsState: true, needsConstituency: true, constituencyType: "FEDERAL", constituencyLabel: "Federal constituency" };
    // GOVERNORSHIP, STATE_ASSEMBLY, LG_CHAIRMANSHIP
    default:
      return { level: "STATE", needsState: true, needsConstituency: false, constituencyType: null, constituencyLabel: null };
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const type = (url.searchParams.get("type") || "GOVERNORSHIP").toUpperCase();
  const state = url.searchParams.get("state");
  const plan = planFor(type);

  const states = await db.state.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  let constituencies: { id: string; name: string; code: string | null; lgas: number }[] = [];
  if (plan.constituencyType && state) constituencies = await listConstituencies(state, plan.constituencyType);

  return NextResponse.json({ type, plan, states, constituencies });
}
