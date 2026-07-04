// Upsert the INEC party registry (factual party details) and log every change.
// Runs inside the app container:
//   docker compose exec -T psr-app node scripts/seed-party-registry.mjs
// Reads scripts/data/inec-party-registry.json (from harvest-inec-party-details.js).
// Idempotent: re-run monthly/quarterly — only changed fields are written, and
// each change (old -> new) is appended to PartyRegistryChange for history.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const db = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));
const DATA = process.argv[2] || join(here, "data", "inec-party-registry.json");
const FIELDS = ["name", "slug", "chairman", "secretary", "treasurer", "financialSecretary", "legalAdviser", "address", "email", "phone", "logoUrl", "source"];
const norm = (v) => (v == null ? "" : String(v).trim());

async function main() {
  const raw = JSON.parse(readFileSync(DATA, "utf8"));
  const parties = raw.parties || [];
  let created = 0, updated = 0, changeCount = 0;
  const changed = [];

  for (const p of parties) {
    const code = String(p.code || "").toUpperCase().trim();
    if (!code) continue;
    const cur = await db.partyRegistry.findUnique({ where: { code } });
    const data = { name: p.name || code };
    for (const f of FIELDS) if (f !== "name") data[f] = p[f] ?? null;

    if (!cur) {
      await db.partyRegistry.create({ data: { code, ...data, checkedAt: new Date() } });
      created++;
      continue;
    }
    const diffs = [];
    for (const f of FIELDS) if (norm(p[f]) !== norm(cur[f])) diffs.push({ field: f, oldValue: cur[f] ?? null, newValue: p[f] ?? null });
    await db.partyRegistry.update({ where: { code }, data: { ...data, checkedAt: new Date() } });
    if (diffs.length) {
      updated++; changeCount += diffs.length; changed.push(`${code}: ${diffs.map((d) => d.field).join(", ")}`);
      for (const d of diffs) await db.partyRegistryChange.create({ data: { code, field: d.field, oldValue: norm(d.oldValue) || null, newValue: norm(d.newValue) || null } });
    }
  }

  console.log(`Party registry: ${parties.length} parties — ${created} new, ${updated} updated, ${changeCount} field changes logged.`);
  if (changed.length) { console.log("Changed:"); changed.forEach((c) => console.log("  " + c)); }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
