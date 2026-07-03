import { db } from "@/lib/db";
import { inecLgas, inecWards, inecUnits, INEC_STATES } from "@/lib/inec";

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";

export type HarvestResult = {
  state: string;
  lgas: number;
  wards: number;
  units: number;
  ms: number;
};

// Warehouse one state's full LGA -> Ward -> PollingUnit tree from INEC.
// Idempotent: re-running upserts by natural keys (delim-derived codes).
export async function harvestState(stateName: string): Promise<HarvestResult> {
  const started = Date.now();
  const state = stateName.toUpperCase().trim();
  const lgas = await inecLgas(state);
  let wardCount = 0;
  let unitCount = 0;
  let stateId: string | null = null;

  const ensureState = async (code: string) => {
    if (stateId) return stateId;
    const s = await db.state.upsert({
      where: { code },
      update: { name: state },
      create: { code, name: state },
    });
    stateId = s.id;
    return stateId;
  };

  for (const lga of lgas) {
    const wards = await inecWards(state, lga);
    for (const ward of wards) {
      const units = await inecUnits(state, lga, ward);
      if (!units.length) continue;
      // Derive hierarchical codes from the delimitation string (SS-LL-WW-UUU).
      const seg = String(units[0].delim || "").split("-");
      const [ss, ll, ww] = [seg[0], seg[1], seg[2]];
      const sCode = ss || slug(state);
      const lCode = ss && ll ? `${ss}-${ll}` : `${sCode}-${slug(lga)}`;
      const wCode = ss && ll && ww ? `${ss}-${ll}-${ww}` : `${lCode}-${slug(ward)}`;

      const stId = await ensureState(sCode);
      const lg = await db.lga.upsert({
        where: { stateId_code: { stateId: stId, code: lCode } },
        update: { name: lga },
        create: { stateId: stId, code: lCode, name: lga },
      });
      const wd = await db.ward.upsert({
        where: { lgaId_code: { lgaId: lg.id, code: wCode } },
        update: { name: ward },
        create: { lgaId: lg.id, code: wCode, name: ward },
      });
      wardCount++;
      await db.pollingUnit.createMany({
        data: units.map((u) => ({
          wardId: wd.id,
          lgaId: lg.id,
          stateId: stId,
          code: u.delim || `${wCode}-${u.id}`,
          name: u.pu || "POLLING UNIT",
          registeredVoters: 0,
        })),
        skipDuplicates: true,
      });
      unitCount += units.length;
    }
  }

  return { state, lgas: lgas.length, wards: wardCount, units: unitCount, ms: Date.now() - started };
}

export async function warehouseSummary() {
  const [states, lgas, wards, units] = await Promise.all([
    db.state.count(),
    db.lga.count(),
    db.ward.count(),
    db.pollingUnit.count(),
  ]);
  return { states, lgas, wards, units, totalStates: INEC_STATES.length };
}
