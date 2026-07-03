#!/usr/bin/env node
// ⚠️ INEC now serves these endpoints only to real browser sessions (bot protection),
// so this Node version fails with "Gave up …" on ANY machine. Use the browser
// harvester instead: scripts/harvest-inec-browser.js (paste into the DevTools
// console on https://www.inecnigeria.org/polling-units/, run INEC.run()). This file
// is kept only as a fallback if that protection is ever relaxed.
//
// Harvest Nigeria's INEC polling-unit register (State → LGA → Ward → Polling Unit)
// to local JSON files, one per state, under data/inec/. Node 18+ (uses
// the built-in fetch; no npm install needed).
//
//   node scripts/harvest-inec.mjs                 # all 37 states (skips finished ones)
//   node scripts/harvest-inec.mjs ONDO LAGOS      # only these states
//   FORCE=1 node scripts/harvest-inec.mjs ONDO    # re-harvest even if the file exists
//
// Output: data/inec/<STATE>.json  →  { state, harvestedAt, lgas, wards, count, units:[{id,pu,delim,lga,ward}] }
// Upload each file afterwards in Admin → Polling-unit warehouse → "Import harvested file".

import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://www.inecnigeria.org/wp-content/themes/rishi/custom/views/";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "inec");
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  Referer: "https://www.inecnigeria.org/polling-units/",
  Accept: "application/json, text/javascript, */*; q=0.01",
};

const STATES = [
  "ABIA", "ADAMAWA", "AKWA IBOM", "ANAMBRA", "BAUCHI", "BAYELSA", "BENUE", "BORNO",
  "CROSS RIVER", "DELTA", "EBONYI", "EDO", "EKITI", "ENUGU", "GOMBE", "IMO", "JIGAWA",
  "KADUNA", "KANO", "KATSINA", "KEBBI", "KOGI", "KWARA", "LAGOS", "NASARAWA", "NIGER",
  "OGUN", "ONDO", "OSUN", "OYO", "PLATEAU", "RIVERS", "SOKOTO", "TARABA", "YOBE",
  "ZAMFARA", "FCT",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

async function getJson(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      const t = await r.text();
      const j = JSON.parse(t);
      if (Array.isArray(j)) return j;
    } catch { /* retry */ }
    await sleep(500 * (i + 1));
  }
  throw new Error(`Gave up on ${url}`);
}

const getLgas = (s) => getJson(`${BASE}lgaView.php?state_id=${enc(s)}`).then((a) => a.map((x) => String(x.lga)).filter(Boolean));
const getWards = (s, l) => getJson(`${BASE}wardView.php?state_id=${enc(s)}&lga_id=${enc(l)}`).then((a) => a.map((x) => String(x.ward)).filter(Boolean));
const getUnits = (s, l, w) =>
  getJson(`${BASE}pollingView.php?state_id=${enc(s)}&lga_id=${enc(l)}&ward_id=${enc(w)}`).then((a) =>
    a.map((x) => ({ id: String(x.id || ""), pu: String(x.pu || "").trim(), delim: String(x.delim || "").trim() })),
  );

// Run fn over items with a bounded concurrency pool, preserving order.
async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fileHasData(path) {
  try { return (await stat(path)).size > 50; } catch { return false; }
}

async function harvestState(state) {
  const file = join(OUT, `${state.replace(/\s+/g, "_")}.json`);
  if (!process.env.FORCE && (await fileHasData(file))) {
    console.log(`• ${state}: already harvested → skip (FORCE=1 to redo)`);
    return;
  }
  const t0 = Date.now();
  process.stdout.write(`→ ${state}: fetching LGAs… `);
  const lgas = await getLgas(state);
  console.log(`${lgas.length} LGAs`);

  const units = [];
  let wardCount = 0;
  for (const lga of lgas) {
    const wards = await getWards(state, lga);
    wardCount += wards.length;
    const perWard = await mapPool(wards, 6, async (ward) => {
      const us = await getUnits(state, lga, ward);
      return us.map((u) => ({ ...u, lga, ward }));
    });
    for (const arr of perWard) for (const u of arr) units.push(u);
    process.stdout.write(`\r  ${state}: ${lga} — running total ${units.length} units          `);
  }

  await mkdir(OUT, { recursive: true });
  const payload = { state, harvestedAt: new Date().toISOString(), lgas: lgas.length, wards: wardCount, count: units.length, units };
  await writeFile(file, JSON.stringify(payload));
  console.log(`\r✓ ${state}: ${lgas.length} LGAs · ${wardCount} wards · ${units.length} units → ${file} (${((Date.now() - t0) / 1000).toFixed(0)}s)          `);
}

async function main() {
  const args = process.argv.slice(2).map((s) => s.toUpperCase());
  const targets = args.length ? args : STATES;
  const unknown = targets.filter((s) => !STATES.includes(s));
  if (unknown.length) { console.error(`Unknown state(s): ${unknown.join(", ")}`); process.exit(1); }
  console.log(`Harvesting ${targets.length} state(s) → ${OUT}\n`);
  for (const s of targets) {
    try { await harvestState(s); } catch (e) { console.error(`✗ ${s}: ${e.message} — re-run to resume`); }
  }
  console.log(`\nDone. Upload the data/inec/*.json files in Admin → Polling-unit warehouse.`);
}

main();
