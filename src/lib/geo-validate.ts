import { db } from "@/lib/db";

// Canonical distribution of Nigeria's 774 LGAs across the 36 states + FCT
// (constitutional count per state; sums to 774). Used to verify completeness.
export const EXPECTED_LGA_COUNTS: Record<string, number> = {
  ABIA: 17, ADAMAWA: 21, "AKWA IBOM": 31, ANAMBRA: 21, BAUCHI: 20, BAYELSA: 8,
  BENUE: 23, BORNO: 27, "CROSS RIVER": 18, DELTA: 25, EBONYI: 13, EDO: 18,
  EKITI: 16, ENUGU: 17, GOMBE: 11, IMO: 27, JIGAWA: 27, KADUNA: 23, KANO: 44,
  KATSINA: 34, KEBBI: 21, KOGI: 21, KWARA: 16, LAGOS: 20, NASARAWA: 13, NIGER: 25,
  OGUN: 20, ONDO: 18, OSUN: 30, OYO: 33, PLATEAU: 17, RIVERS: 23, SOKOTO: 23,
  TARABA: 16, YOBE: 17, ZAMFARA: 14, FCT: 6,
};
export const EXPECTED_TOTAL_LGAS = Object.values(EXPECTED_LGA_COUNTS).reduce((a, b) => a + b, 0); // 774

export type StateCoverage = {
  state: string; lgas: number; expectedLgas: number | null; wards: number; units: number;
  emptyLgas: number; complete: boolean;
};

// Compare what's warehoused against the canonical 774-LGA distribution and surface
// gaps (states short on LGAs, and LGAs/wards that have no polling units).
export async function validateWarehouse() {
  // Set-based aggregates only (a handful of queries) — the old per-state loop ran
  // ~130 correlated counts and crawled on 150k+ units.
  const [states, allLgas, wardGroups, lgaUnitGroups, wardUnitGroups] = await Promise.all([
    db.state.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { lgas: true, units: true } } } }),
    db.lga.findMany({ select: { id: true, stateId: true } }),
    db.ward.groupBy({ by: ["lgaId"], _count: { _all: true } }),        // wards per LGA
    db.pollingUnit.groupBy({ by: ["lgaId"], _count: { _all: true } }), // LGAs that have units
    db.pollingUnit.groupBy({ by: ["wardId"], _count: { _all: true } }),// wards that have units
  ]);

  const stateOfLga = new Map(allLgas.map((l) => [l.id, l.stateId]));
  const wardsByState = new Map<string, number>();
  let totalWards = 0;
  for (const w of wardGroups) {
    totalWards += w._count._all;
    const sid = stateOfLga.get(w.lgaId);
    if (sid) wardsByState.set(sid, (wardsByState.get(sid) || 0) + w._count._all);
  }

  const lgaHasUnits = new Set(lgaUnitGroups.map((x) => x.lgaId));
  const emptyLgaByState = new Map<string, number>();
  for (const l of allLgas) if (!lgaHasUnits.has(l.id)) emptyLgaByState.set(l.stateId, (emptyLgaByState.get(l.stateId) || 0) + 1);

  const emptyWards = totalWards - wardUnitGroups.length; // wards with no polling units

  const rows: StateCoverage[] = [];
  const shortStates: { state: string; have: number; expected: number }[] = [];
  for (const s of states) {
    const lgas = s._count.lgas;
    const units = s._count.units;
    const wards = wardsByState.get(s.id) || 0;
    const emptyLgas = emptyLgaByState.get(s.id) || 0;
    const expected = EXPECTED_LGA_COUNTS[s.name.toUpperCase()] ?? null;
    const complete = expected != null && lgas >= expected && emptyLgas === 0;
    rows.push({ state: s.name, lgas, expectedLgas: expected, wards, units, emptyLgas, complete });
    if (expected != null && lgas < expected) shortStates.push({ state: s.name, have: lgas, expected });
  }

  const have = new Set(states.map((s) => s.name.toUpperCase()));
  const missingStates = Object.keys(EXPECTED_LGA_COUNTS).filter((n) => !have.has(n));

  const totalLgas = rows.reduce((n, r) => n + r.lgas, 0);
  const totalUnits = rows.reduce((n, r) => n + r.units, 0);

  return {
    summary: {
      states: states.length, expectedStates: 37,
      lgas: totalLgas, expectedLgas: EXPECTED_TOTAL_LGAS,
      wards: totalWards, units: totalUnits,
      emptyWards, missingStates, shortStates,
      complete: states.length === 37 && totalLgas >= EXPECTED_TOTAL_LGAS && emptyWards === 0,
    },
    states: rows,
  };
}
