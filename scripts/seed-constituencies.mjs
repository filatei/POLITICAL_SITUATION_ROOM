// Seed the Constituency warehouse from a parsed INEC dataset.
// Runs inside the app container (has @prisma/client + DATABASE_URL):
//   docker compose exec -T psr-app node scripts/seed-constituencies.mjs
// Reads scripts/data/inec-constituencies.json produced by parse_constituencies.py.
// Idempotent: upserts constituencies and (for SENATORIAL/FEDERAL) links LGAs by
// name against the already-warehoused geography.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const db = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));
const DATA = process.argv[2] || join(here, "data", "inec-constituencies.json");
const norm = (s) => String(s || "").trim().toUpperCase();

async function main() {
  const raw = JSON.parse(readFileSync(DATA, "utf8"));
  const states = Object.keys(raw);
  console.log(`Seeding ${states.length} states from ${DATA}`);
  let totalC = 0, totalLinks = 0;
  const unmatchedByState = {};

  for (const stateName of states) {
    const state = await db.state.findFirst({ where: { name: norm(stateName) } });
    if (!state) { console.warn(`  ! state not in geo warehouse: ${stateName} (skipped)`); continue; }
    const lgas = await db.lga.findMany({ where: { stateId: state.id }, select: { id: true, name: true } });
    const lgaByName = new Map(lgas.map((l) => [norm(l.name), l.id]));
    const unmatched = new Set();

    for (const type of ["SENATORIAL", "FEDERAL", "STATE"]) {
      const rows = raw[stateName][type] || [];
      for (const row of rows) {
        const name = String(row.name || "").trim();
        if (!name) continue;
        const members = row.lgas || [];
        const c = await db.constituency.upsert({
          where: { stateId_type_name: { stateId: state.id, type, name } },
          create: { stateId: state.id, type, name, code: row.code || null, composition: members, collation: row.collation || null },
          update: { code: row.code || undefined, composition: members, collation: row.collation || undefined },
        });
        totalC++;
        if (type !== "STATE") {
          for (const m of members) {
            const id = lgaByName.get(norm(m));
            if (!id) { unmatched.add(m); continue; }
            await db.constituencyLga.upsert({
              where: { constituencyId_lgaId: { constituencyId: c.id, lgaId: id } },
              create: { constituencyId: c.id, lgaId: id }, update: {},
            });
            totalLinks++;
          }
        }
      }
    }
    // backup for rebuild
    for (const type of ["SENATORIAL", "FEDERAL", "STATE"]) {
      const rows = raw[stateName][type] || [];
      await db.constituencyImport.upsert({
        where: { key: `${norm(stateName)}:${type}` },
        create: { key: `${norm(stateName)}:${type}`, state: norm(stateName), type, count: rows.length, payload: rows },
        update: { count: rows.length, payload: rows },
      });
    }
    if (unmatched.size) unmatchedByState[stateName] = [...unmatched];
    console.log(`  ✓ ${stateName}: sen=${(raw[stateName].SENATORIAL||[]).length} fed=${(raw[stateName].FEDERAL||[]).length} state=${(raw[stateName].STATE||[]).length}`);
  }

  console.log(`\nDone. ${totalC} constituencies, ${totalLinks} LGA links.`);
  if (Object.keys(unmatchedByState).length) {
    console.log("Unmatched LGA names (reconcile spelling vs geo warehouse):");
    for (const [s, u] of Object.entries(unmatchedByState)) console.log(`  ${s}: ${u.join(", ")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
