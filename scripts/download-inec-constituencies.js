/* =============================================================================
   INEC "Electoral Constituencies of the Federation" — bulk downloader.

   Downloads all 37 state XLSX files (senatorial districts, federal constituencies
   and state constituencies with their LGA/ward composition). INEC blocks
   server/curl clients, so we fetch from a real browser tab. The download links
   are injected by JavaScript (not in the raw HTML), so we use the verified
   direct file URLs below.

   HOW TO RUN
   1. Open (any INEC page works, e.g.)
        https://wp1.inecnigeria.org/electoral-constituencies-of-the-federation/
   2. DevTools -> Console (Cmd+Option+J).
   3. Paste this whole file, press Enter.
   4. Click the green button. Allow "multiple downloads" if Chrome asks.
   5. Move the 37 .xlsx files into:
        POLITICAL_SITUATION_ROOM/LEGAL/INEC/CONSTITUENCIES/
   Then tell Claude to parse + seed them.
   ============================================================================= */
(() => {
  const BASE = "https://wp1.inecnigeria.org/wp-content/uploads/";
  // state -> exact uploaded filename (verified 2026-07)
  const FILES = {
    ABIA: "ABIA.xlsx", ADAMAWA: "ADAMAWA.xlsx", "AKWA IBOM": "AKWA-IBOM.xlsx",
    ANAMBRA: "ANAMBRA.xlsx", BAUCHI: "BAUCHI.xlsx", BAYELSA: "BAYELSA.xlsx",
    BENUE: "BENUE.xlsx", BORNO: "BORNO.xlsx", "CROSS RIVER": "CROSS-RIVER.xlsx",
    DELTA: "DELTA.xlsx", EBONYI: "EBONYI.xlsx", EDO: "EDO.xlsx", EKITI: "EKITI.xlsx",
    ENUGU: "ENUGU.xlsx", FCT: "FCT.xlsx", GOMBE: "GOMBE.xlsx", IMO: "Imo.xlsx",
    JIGAWA: "JIGAWA.xlsx", KADUNA: "KADUNA.xlsx", KANO: "KANO.xlsx", KATSINA: "KATSINA.xlsx",
    KEBBI: "KEBBI.xlsx", KOGI: "KOGI.xlsx", KWARA: "KWARA.xlsx", LAGOS: "LAGOS.xlsx",
    NASARAWA: "NASARAWA.xlsx", NIGER: "NIGER.xlsx", OGUN: "OGUN.xlsx", ONDO: "ONDO.xlsx",
    OSUN: "OSUN.xlsx", OYO: "OYO.xlsx", PLATEAU: "PLATEAU.xlsx", RIVERS: "RIVERS.xlsx",
    SOKOTO: "SOKOTO.xlsx", TARABA: "TARABA.xlsx", YOBE: "YOBE.xlsx", ZAMFARA: "ZAMFARA.xlsx",
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function dl(url, filename) {
    const blob = await fetch(url, { credentials: "include" }).then((r) => r.blob());
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  }

  const entries = Object.entries(FILES);
  const b = document.createElement("button");
  b.textContent = `⬇ Download ${entries.length} INEC constituency files`;
  b.style.cssText = "position:fixed;z-index:99999;top:20px;left:50%;transform:translateX(-50%);padding:16px 26px;font:700 16px system-ui;background:#16a34a;color:#fff;border:0;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);cursor:pointer";
  b.onclick = async () => {
    b.disabled = true;
    let n = 0;
    for (const [state, file] of entries) {
      try {
        await dl(BASE + file, state.replace(/ /g, "_") + ".xlsx");
        n++; b.textContent = `Downloaded ${n}/${entries.length} — ${state}…`;
      } catch (e) { console.warn("failed", state, e); }
      await sleep(450);
    }
    b.textContent = `✓ Done — ${n} files. Move them into LEGAL/INEC/CONSTITUENCIES/`;
    b.style.background = "#0a7d34";
  };
  document.body.appendChild(b);
  console.log("Ready — click the green button to download all 37 files.");
})();
