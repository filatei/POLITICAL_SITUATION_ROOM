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

export type RawUnit = { id?: string; pu?: string; delim?: string; lga?: string; ward?: string };

// Import a state's units from a harvested file (produced by scripts/harvest-inec.mjs).
// Units arrive as a flat list carrying their lga + ward names + delim; we group and
// upsert into State/Lga/Ward/PollingUnit exactly like harvestState. Idempotent.
export async function importUnits(stateName: string, rows: RawUnit[], replace = false): Promise<HarvestResult> {
  const started = Date.now();
  const state = stateName.toUpperCase().trim();

  // Full refresh of one state (for INEC updates): drop its existing units/wards/LGAs
  // first so removed/renamed rows don't linger. Detaches agent/submission links so
  // FKs don't block. Without replace, import is additive (skipDuplicates).
  if (replace) {
    const existing = await db.state.findFirst({ where: { name: state } });
    if (existing) {
      await db.agent.updateMany({ where: { stateId: existing.id }, data: { pollingUnitId: null, wardId: null, lgaId: null, stateId: null } });
      await db.submission.updateMany({ where: { pollingUnit: { stateId: existing.id } }, data: { pollingUnitId: null } });
      await db.pollingUnit.deleteMany({ where: { stateId: existing.id } });
      await db.ward.deleteMany({ where: { lga: { stateId: existing.id } } });
      await db.lga.deleteMany({ where: { stateId: existing.id } });
    }
  }

  const byLga = new Map<string, Map<string, RawUnit[]>>();
  for (const u of rows) {
    const lga = String(u.lga || "").trim();
    const ward = String(u.ward || "").trim();
    if (!lga || !ward) continue;
    if (!byLga.has(lga)) byLga.set(lga, new Map());
    const wards = byLga.get(lga)!;
    if (!wards.has(ward)) wards.set(ward, []);
    wards.get(ward)!.push(u);
  }

  let stateId: string | null = null;
  let wardCount = 0;
  let unitCount = 0;
  const ensureState = async (code: string) => {
    if (stateId) return stateId;
    const s = await db.state.upsert({ where: { code }, update: { name: state }, create: { code, name: state } });
    stateId = s.id;
    return stateId;
  };

  for (const [lga, wardMap] of byLga) {
    for (const [ward, units] of wardMap) {
      if (!units.length) continue;
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

  // Back up the raw file server-side so the warehouse can be rebuilt without re-upload.
  await db.geoImport.upsert({
    where: { state },
    update: { units: unitCount, payload: rows as any },
    create: { state, units: unitCount, payload: rows as any },
  });

  return { state, lgas: byLga.size, wards: wardCount, units: unitCount, ms: Date.now() - started };
}

// List the server-side backups (one per imported state).
export async function savedImports() {
  return db.geoImport.findMany({ select: { state: true, units: true, importedAt: true }, orderBy: { state: "asc" } });
}

// Rebuild the whole warehouse from the server-side backups (no file re-upload).
export async function rebuildFromSaved(): Promise<{ states: number; units: number }> {
  const saved = await db.geoImport.findMany();
  let units = 0;
  for (const s of saved) {
    const rows = ((s.payload as unknown) as RawUnit[]) || [];
    const res = await importUnits(s.state, rows, true); // clean rebuild per state
    units += res.units;
  }
  return { states: saved.length, units };
}

// Wipe ALL warehoused geography. Detaches agent + submission unit references first
// so foreign keys don't block the delete. Use before a clean national re-import.
export async function clearWarehouse() {
  await db.agent.updateMany({ data: { pollingUnitId: null, wardId: null, lgaId: null, stateId: null } });
  await db.submission.updateMany({ where: { pollingUnitId: { not: null } }, data: { pollingUnitId: null } });
  const units = await db.pollingUnit.deleteMany({});
  const wards = await db.ward.deleteMany({});
  const lgas = await db.lga.deleteMany({});
  const states = await db.state.deleteMany({});
  return { states: states.count, lgas: lgas.count, wards: wards.count, units: units.count };
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
