import { db } from "@/lib/db";

// A constituency and the units (by name) that compose it: LGAs for SENATORIAL /
// FEDERAL, registration areas (wards) for STATE.
export type ConstituencyRow = { name: string; code?: string; lgas: string[]; collation?: string };
export type CType = "SENATORIAL" | "FEDERAL" | "STATE";

const norm = (s: string) => s.trim().toUpperCase();

// Import (or replace) the senatorial / federal constituencies for one state.
// LGAs are matched by name against the already-warehoused LGAs of that state;
// unmatched LGA names are reported so the operator can reconcile spelling.
export async function importConstituencies(
  stateName: string,
  type: CType,
  rows: ConstituencyRow[],
  replace = false,
): Promise<{ state: string; type: CType; constituencies: number; linked: number; unmatched: string[]; ms: number }> {
  const t0 = Date.now();
  const state = await db.state.findFirst({ where: { name: norm(stateName) } });
  if (!state) throw new Error(`State not in warehouse: ${stateName}. Import its geography first.`);

  // Build an LGA name -> id map for this state (case-insensitive).
  const lgas = await db.lga.findMany({ where: { stateId: state.id }, select: { id: true, name: true } });
  const lgaByName = new Map(lgas.map((l) => [norm(l.name), l.id]));

  if (replace) {
    const existing = await db.constituency.findMany({ where: { stateId: state.id, type }, select: { id: true } });
    const ids = existing.map((c) => c.id);
    if (ids.length) {
      // Null out any elections still pointing here, then delete (links cascade).
      await db.election.updateMany({ where: { scopeConstituencyId: { in: ids } }, data: { scopeConstituencyId: null } });
      await db.constituency.deleteMany({ where: { id: { in: ids } } });
    }
  }

  const unmatched = new Set<string>();
  let linked = 0;
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    const members = row.lgas || [];
    const c = await db.constituency.upsert({
      where: { stateId_type_name: { stateId: state.id, type, name } },
      create: { stateId: state.id, type, name, code: row.code || null, composition: members as any, collation: row.collation || null },
      update: { code: row.code || undefined, composition: members as any, collation: row.collation || undefined },
    });
    // SENATORIAL/FEDERAL compose whole LGAs -> link them. STATE composes wards,
    // which won't match LGA names, so only the composition JSON is stored.
    if (type !== "STATE") {
      for (const raw of members) {
        const id = lgaByName.get(norm(raw));
        if (!id) { unmatched.add(raw); continue; }
        await db.constituencyLga.upsert({
          where: { constituencyId_lgaId: { constituencyId: c.id, lgaId: id } },
          create: { constituencyId: c.id, lgaId: id },
          update: {},
        });
        linked++;
      }
    }
  }

  // Backup for rebuild.
  await db.constituencyImport.upsert({
    where: { key: `${norm(stateName)}:${type}` },
    create: { key: `${norm(stateName)}:${type}`, state: norm(stateName), type, count: rows.length, payload: rows as any },
    update: { count: rows.length, payload: rows as any },
  });

  const count = await db.constituency.count({ where: { stateId: state.id, type } });
  return { state: state.name, type, constituencies: count, linked, unmatched: [...unmatched], ms: Date.now() - t0 };
}

// List constituencies of a type for a state (name-first lookup), with LGA counts.
export async function listConstituencies(stateName: string, type: CType) {
  const state = await db.state.findFirst({ where: { name: norm(stateName) } });
  if (!state) return [];
  const rows = await db.constituency.findMany({
    where: { stateId: state.id, type },
    select: { id: true, name: true, code: true, composition: true, collation: true, _count: { select: { lgaLinks: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, code: c.code, lgas: c._count.lgaLinks, composition: (c.composition as string[]) || [], collation: c.collation }));
}

// The set of LGA ids that fall inside an election's scope — the basis for
// provisioning agents only to polling units within the contested area.
export async function scopeLgaIds(constituencyId: string): Promise<string[]> {
  const links = await db.constituencyLga.findMany({ where: { constituencyId }, select: { lgaId: true } });
  return links.map((l) => l.lgaId);
}

// Typeahead across all constituencies (name or delimitation code), for the
// public search + API. Returns each hit with its state and composition.
export async function searchConstituencies(q: string, take = 20) {
  const rows = await db.constituency.findMany({
    where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] },
    select: { id: true, name: true, code: true, type: true, composition: true, state: { select: { name: true } } },
    take,
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return rows.map((c) => ({
    id: c.id, type: c.type, name: c.name, code: c.code, state: c.state.name,
    composition: (c.composition as string[]) || [],
  }));
}

export async function constituencySummary() {
  const rows = await db.constituency.groupBy({ by: ["stateId", "type"], _count: { _all: true } });
  const byType = { SENATORIAL: 0, FEDERAL: 0, STATE: 0 } as Record<string, number>;
  for (const r of rows) byType[r.type] = (byType[r.type] || 0) + r._count._all;
  const saved = await db.constituencyImport.findMany({ select: { key: true, count: true, importedAt: true } });
  return { byType, saved };
}
