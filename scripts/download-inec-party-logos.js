/* =============================================================================
   INEC party-logo downloader (browser console).

   The room shows a party badge per party; PartyBadge auto-loads
   /uploads/party-logos/<CODE>.png (falling back to the coloured acronym chip).
   So we just need the logo files named by acronym in that folder.

   INEC's political-parties page publishes only a subset of party emblems, and
   with inconsistent filenames — the verified ones are mapped below. Logos are
   the parties' own marks, used here only to identify each party on the board.

   HOW TO RUN
   1. Open https://www.inecnigeria.org/political-parties/ in Chrome.
   2. DevTools -> Console. Paste this file, press Enter.
   3. Click the green button. Allow "multiple downloads" if asked.
   4. Put the downloaded <CODE>.png files on the server at
        /opt/psr/data/uploads/party-logos/
      (that volume maps to /app/public/uploads inside the app, so the app
      serves them at /uploads/party-logos/<CODE>.png). Create the folder if
      needed. Any other parties: drop a <CODE>.png there the same way.
   ============================================================================= */
(() => {
  const BASE = "https://wp1.inecnigeria.org/wp-content/uploads/";
  // acronym -> exact uploaded filename on INEC (verified 2026-07)
  const MAP = {
    PDP: "2024/06/PDP-150x150-1.jpg",
    NNPP: "2024/06/nnpp-1.jpg",
    SDP: "2024/06/SDP-150x150-1.png",
    YPP: "2024/06/YPP-150x150-1.png",
    PRP: "2024/06/PRP.png",
    ZLP: "2024/06/ZLP.jpg",
    DLA: "logo-DLA.jpg",
    NDC: "NDC.jpg",
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function dl(url, name) {
    const blob = await fetch(url, { credentials: "include" }).then((r) => r.blob());
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  }
  const entries = Object.entries(MAP);
  const b = document.createElement("button");
  b.textContent = `⬇ Download ${entries.length} party logos`;
  b.style.cssText = "position:fixed;z-index:99999;top:20px;left:50%;transform:translateX(-50%);padding:16px 26px;font:700 16px system-ui;background:#16a34a;color:#fff;border:0;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);cursor:pointer";
  b.onclick = async () => {
    b.disabled = true; let n = 0;
    for (const [code, file] of entries) {
      try { await dl(BASE + file, code + ".png"); n++; b.textContent = `Saved ${code}.png (${n}/${entries.length})`; }
      catch (e) { console.warn("failed", code, e); }
      await sleep(400);
    }
    b.textContent = `✓ ${n} logos. Put them in /opt/psr/data/uploads/party-logos/`;
    b.style.background = "#0a7d34";
  };
  document.body.appendChild(b);
  console.log("Ready — click the green button.");
})();
