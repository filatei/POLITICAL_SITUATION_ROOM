/* =============================================================================
   INEC "Electoral Constituencies of the Federation" — bulk downloader.

   Downloads all 37 state XLSX files (senatorial districts, federal constituencies
   and state constituencies with their LGA/ward composition). INEC blocks
   server/curl clients, so we fetch from a real browser tab.

   HOW TO RUN
   1. Open https://www.inecnigeria.org/electoral-constituencies-of-the-federation/
   2. DevTools → Console (Cmd+Option+J).
   3. Paste this whole file, press Enter.
   4. Click the green button. Allow "multiple downloads" if Chrome asks.
   5. Move the 37 .xlsx files into:
        POLITICAL_SITUATION_ROOM/LEGAL/INEC/CONSTITUENCIES/
   Then tell Claude to parse + seed them.
   ============================================================================= */
(() => {
  const ORIGIN = "https://wp1.inecnigeria.org";
  const INDEX = ORIGIN + "/electoral-constituencies-of-the-federation/";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function stateLinks() {
    const html = await fetch(INDEX, { credentials: "include" }).then((r) => r.text());
    const re = /href="(https:\/\/wp1\.inecnigeria\.org\/electoral-constituencies-of-the-federation\/[a-z-]+\d*\/)"[^>]*>\s*([A-Z][A-Za-z ]+?)\s*</g;
    const seen = new Map();
    for (const m of html.matchAll(re)) {
      const name = m[2].trim().toUpperCase();
      if (name && !/ELECTORAL/.test(name)) seen.set(m[1], { name, url: m[1] });
    }
    return [...seen.values()];
  }

  async function xlsxHref(pageUrl) {
    const html = await fetch(pageUrl, { credentials: "include" }).then((r) => r.text());
    const m = html.match(/href="([^"]*\/wp-content\/uploads\/[^"]+\.xlsx)"/i);
    return m ? (m[1].startsWith("http") ? m[1] : ORIGIN + m[1]) : null;
  }

  async function dl(url, filename) {
    const blob = await fetch(url, { credentials: "include" }).then((r) => r.blob());
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  }

  function button(label, onClick) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "position:fixed;z-index:99999;top:20px;left:50%;transform:translateX(-50%);padding:16px 26px;font:700 16px system-ui;background:#16a34a;color:#fff;border:0;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);cursor:pointer";
    b.onclick = onClick;
    document.body.appendChild(b);
    return b;
  }

  (async () => {
    const links = await stateLinks();
    console.log(`Found ${links.length} states. Resolving file URLs…`);
    const files = [];
    for (const l of links) {
      try {
        const href = await xlsxHref(l.url);
        files.push({ state: l.name, href });
        console.log(href ? `✓ ${l.name}` : `✗ ${l.name} (no xlsx)`);
      } catch (e) { console.warn("err", l.name, e); }
      await sleep(120);
    }
    const ok = files.filter((f) => f.href);
    const b = button(`⬇ Download ${ok.length} constituency files`, async () => {
      b.disabled = true;
      for (const f of ok) {
        const fn = f.state.replace(/\s+/g, "_") + ".xlsx";
        await dl(f.href, fn);
        b.textContent = `Downloaded ${fn}…`;
        await sleep(500);
      }
      b.textContent = `✓ Done — ${ok.length} files. Move them to LEGAL/INEC/CONSTITUENCIES/`;
      b.style.background = "#0a7d34";
    });
  })();
})();
