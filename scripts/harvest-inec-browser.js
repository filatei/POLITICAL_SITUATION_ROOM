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

  async function j(url, tries = 8) {
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url, { headers: HDR, credentials: "include" });
        const d = JSON.parse(await r.text());
        if (Array.isArray(d)) return d;
      } catch (e) { /* retry */ }
      await sleep(600 * (i + 1));
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

  function saveFile(name, payload) {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  }

  // Show a big fixed button. Chrome blocks *automatic* downloads but never a
  // download triggered by a real user click — so we let the user click to save.
  function showDownloadButton(name, payload) {
    document.getElementById("__inecdl")?.remove();
    const btn = document.createElement("button");
    btn.id = "__inecdl";
    btn.textContent = `⬇ Click to download ${name} (${payload.count ?? payload.units?.length ?? ""} units)`;
    btn.style.cssText = "position:fixed;top:90px;left:24px;z-index:2147483647;padding:20px 26px;font-size:18px;font-weight:800;background:#26a65b;color:#fff;border:4px solid #fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.6);cursor:pointer";
    btn.onclick = () => { saveFile(name, payload); btn.textContent = `✓ Saved ${name} — check Downloads`; btn.style.background = "#0a7a3f"; };
    document.body.appendChild(btn);
  }

  async function harvestState(state) {
    const t0 = Date.now();
    console.log(`→ ${state}: fetching LGAs…`);
    const lgas = await getLgas(state);
    const units = [];
    let wards = 0;
    const failed = [];
    const push = (us, lga, ward) => {
      for (const u of us) {
        units.push({
          id: String(u.id || ""),
          pu: String(u.pu || "").trim(),
          delim: String(u.delim || "").trim(),
          lga: String(u.lga || lga).trim(),
          ward: String(u.ward || ward).trim(),
        });
      }
    };
    for (const lga of lgas) {
      let wl = [];
      try { wl = await getWards(state, lga); } catch (e) { console.warn(`   ${state}: ward list failed for ${lga}`); }
      wards += wl.length;
      // A single flaky ward must NOT abort the whole state — collect & retry later.
      await pool(wl, 3, async (ward) => {
        try { push(await getUnits(state, lga, ward), lga, ward); }
        catch (e) { failed.push([lga, ward]); }
      });
      console.log(`   ${state}: ${lga} — total ${units.length} units${failed.length ? ` (${failed.length} wards to retry)` : ""}`);
    }
    if (failed.length) {
      console.warn(`${state}: retrying ${failed.length} failed wards…`);
      const still = [];
      for (const [lga, ward] of failed) {
        try { push(await getUnits(state, lga, ward), lga, ward); } catch (e) { still.push([lga, ward]); }
        await sleep(500);
      }
      if (still.length) console.warn(`${state}: ${still.length} wards still failed — file saved anyway, re-run to fill gaps`);
    }
    const payload = { state, harvestedAt: new Date().toISOString(), lgas: lgas.length, wards, count: units.length, units };
    console.log(`✓ ${state}: ${lgas.length} LGAs · ${wards} wards · ${units.length} units (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    return payload;
  }

  window.INEC = {
    STATES,
    store: [],
    async run(list) {
      const targets = (list && list.length ? list : STATES).map((s) => s.toUpperCase());
      console.log(`%cINEC harvest starting: ${targets.length} state(s)`, "color:#26a65b;font-weight:bold");
      const store = [];
      for (const s of targets) {
        try { store.push(await harvestState(s)); } catch (e) { console.error(`✗ ${s}: ${e.message} — re-run INEC.run(["${s}"]) to retry`); }
      }
      this.store = store;
      const name = store.length === 1 ? store[0].state.replace(/\s+/g, "_") + ".json" : "NIGERIA-INEC-all.json";
      const payload = store.length === 1 ? store[0] : { harvestedAt: new Date().toISOString(), count: store.reduce((n, s) => n + s.count, 0), states: store };
      showDownloadButton(name, payload);
      console.log(`%cDone — ${store.length} state(s) harvested. CLICK the green button (top-left) to download ${name}, then upload it in PSR admin → Polling-unit warehouse.`, "color:#26a65b;font-weight:bold;font-size:14px");
    },
  };
  console.log("%cINEC harvester ready. Run:  INEC.run()   (all)   or   INEC.run([\"ONDO\"])", "color:#26a65b;font-weight:bold");
})();
