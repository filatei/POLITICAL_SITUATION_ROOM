/* =============================================================================
   INEC polling-unit harvester — BROWSER CONSOLE version.

   Why this and not the Node script? INEC sits behind bot protection that rejects
   non-browser clients (curl/node/fetch-from-server all fail, on any IP). A real
   logged-in browser tab passes. So we harvest from the page's own origin.

   HOW TO RUN
   1. Open https://www.inecnigeria.org/polling-units/  in Chrome.
   2. Open DevTools → Console (Cmd+Option+J).
   3. Paste this ENTIRE file and press Enter.
   4. Run one of:
        INEC.run()                       // all 37 states
        INEC.run(["ONDO"])               // just Ondo
        INEC.run(["ONDO","LAGOS","KANO"])// a few
   5. Your browser downloads one <STATE>.json per state (allow multiple downloads
      if Chrome asks). Then upload those files in the PSR admin →
      Polling-unit warehouse → "Import harvested files".

   Each file: { state, harvestedAt, lgas, wards, count, units:[{id,pu,delim,lga,ward}] }
   ============================================================================= */
(() => {
  const BASE = "/wp-content/themes/rishi/custom/views/";
  const enc = encodeURIComponent;
  const HDR = { "X-Requested-With": "XMLHttpRequest" };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const STATES = [
    "ABIA", "ADAMAWA", "AKWA IBOM", "ANAMBRA", "BAUCHI", "BAYELSA", "BENUE", "BORNO",
    "CROSS RIVER", "DELTA", "EBONYI", "EDO", "EKITI", "ENUGU", "GOMBE", "IMO", "JIGAWA",
    "KADUNA", "KANO", "KATSINA", "KEBBI", "KOGI", "KWARA", "LAGOS", "NASARAWA", "NIGER",
    "OGUN", "ONDO", "OSUN", "OYO", "PLATEAU", "RIVERS", "SOKOTO", "TARABA", "YOBE",
    "ZAMFARA", "FCT",
  ];

  async function j(url, tries = 6) {
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url, { headers: HDR, credentials: "include" });
        const d = JSON.parse(await r.text());
        if (Array.isArray(d)) return d;
      } catch (e) { /* retry */ }
      await sleep(400 * (i + 1));
    }
    throw new Error("gave up: " + url);
  }

  const getLgas = (s) => j(`${BASE}lgaView.php?state_id=${enc(s)}`).then((a) => a.map((x) => String(x.lga)).filter(Boolean));
  const getWards = (s, l) => j(`${BASE}wardView.php?state_id=${enc(s)}&lga_id=${enc(l)}`).then((a) => a.map((x) => String(x.ward)).filter(Boolean));
  const getUnits = (s, l, w) => j(`${BASE}pollingView.php?state_id=${enc(s)}&lga_id=${enc(l)}&ward_id=${enc(w)}`);

  async function pool(items, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const idx = i++; await fn(items[idx]); }
    }));
  }

  function download(state, payload) {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = state.replace(/\s+/g, "_") + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function harvestState(state) {
    const t0 = Date.now();
    console.log(`→ ${state}: fetching LGAs…`);
    const lgas = await getLgas(state);
    const units = [];
    let wards = 0;
    for (const lga of lgas) {
      const wl = await getWards(state, lga);
      wards += wl.length;
      await pool(wl, 6, async (ward) => {
        const us = await getUnits(state, lga, ward);
        for (const u of us) {
          units.push({
            id: String(u.id || ""),
            pu: String(u.pu || "").trim(),
            delim: String(u.delim || "").trim(),
            lga: String(u.lga || lga).trim(),
            ward: String(u.ward || ward).trim(),
          });
        }
      });
      console.log(`   ${state}: ${lga} — total ${units.length} units`);
    }
    const payload = { state, harvestedAt: new Date().toISOString(), lgas: lgas.length, wards, count: units.length, units };
    download(state, payload);
    console.log(`✓ ${state}: ${lgas.length} LGAs · ${wards} wards · ${units.length} units → downloaded (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    return payload;
  }

  window.INEC = {
    STATES,
    async run(list) {
      const targets = (list && list.length ? list : STATES).map((s) => s.toUpperCase());
      console.log(`%cINEC harvest starting: ${targets.length} state(s)`, "color:#26a65b;font-weight:bold");
      for (const s of targets) {
        try { await harvestState(s); } catch (e) { console.error(`✗ ${s}: ${e.message} — re-run INEC.run(["${s}"]) to retry`); }
      }
      console.log("%cDone. Upload the downloaded *.json files in PSR admin → Polling-unit warehouse.", "color:#26a65b;font-weight:bold");
    },
  };
  console.log("%cINEC harvester ready. Run:  INEC.run()   (all)   or   INEC.run([\"ONDO\"])", "color:#26a65b;font-weight:bold");
})();
