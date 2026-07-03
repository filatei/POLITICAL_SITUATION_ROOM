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
  const states = await db.state.findMany({ orderBy: { name: "asc" } });
  const rows: StateCoverage[] = [];
  const shortStates: { state: string; have: number; expected: number }[] = [];

  for (const s of states) {
    const [lgas, wards, units, emptyLgas] = await Promise.all([
      db.lga.count({ where: { stateId: s.id } }),
      db.ward.count({ where: { lga: { stateId: s.id } } }),
      db.pollingUnit.count({ where: { stateId: s.id } }),
      db.lga.count({ where: { stateId: s.id, units: { none: {} } } }),
    ]);
    const expected = EXPECTED_LGA_COUNTS[s.name.toUpperCase()] ?? null;
    const complete = expected != null && lgas >= expected && emptyLgas === 0;
    rows.push({ state: s.name, lgas, expectedLgas: expected, wards, units, emptyLgas, complete });
    if (expected != null && lgas < expected) shortStates.push({ state: s.name, have: lgas, expected });
  }

  // Missing states (present in the canonical list but not warehoused at all).
  const have = new Set(states.map((s) => s.name.toUpperCase()));
  const missingStates = Object.keys(EXPECTED_LGA_COUNTS).filter((n) => !have.has(n));

  // Wards with no units (the actual harvest gaps to re-fetch).
  const emptyWards = await db.ward.count({ where: { units: { none: {} } } });

  const totalLgas = rows.reduce((n, r) => n + r.lgas, 0);
  const totalUnits = rows.reduce((n, r) => n + r.units, 0);
  const totalWards = rows.reduce((n, r) => n + r.wards, 0);

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
