/* =============================================================================
   INEC party-details harvester (browser console).

   Party pages follow a consistent URL: /political-parties/<name-slug>-<acronym>/
   Each page is a table: Party Logo, <ACRONYM> = full name, National Chairman,
   Secretary, Treasurer, Financial Secretary, Legal Adviser, Address (+Email),
   Phone Number. These are factual public registration records.

   HOW TO RUN
   1. Open https://www.inecnigeria.org/political-parties/ in Chrome.
   2. DevTools -> Console. Paste this file, press Enter. Wait for it to walk
      every party page (progress logs in the console).
   3. Click the green button -> saves inec-party-registry.json.
   4. Put that file at scripts/data/inec-party-registry.json in the repo, commit,
      deploy, then run the seed to record it (with change history):
        docker compose exec -T psr-app node scripts/seed-party-registry.mjs
   Re-run monthly/quarterly to keep details current — the seed logs every change.
   ============================================================================= */
(() => {
  const ORIGIN = "https://wp1.inecnigeria.org";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  async function partyLinks() {
    const html = await fetch(ORIGIN + "/political-parties/", { credentials: "include" }).then((r) => r.text());
    const set = new Set();
    for (const m of html.matchAll(/href="(https:\/\/wp1\.inecnigeria\.org\/political-parties\/[a-z0-9-]+\/)"/g)) {
      if (!/political-parties\/$/.test(m[1])) set.add(m[1]);
    }
    return [...set];
  }

  function parse(html, url) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const cells = {}; let logo = null;
    doc.querySelectorAll("tr").forEach((tr) => {
      const td = tr.querySelectorAll("td,th");
      if (td.length < 2) return;
      const label = clean(td[0].innerText);
      if (/party logo/i.test(label)) { const img = td[1].querySelector("img"); if (img) logo = img.src; return; }
      cells[label.toLowerCase()] = clean(td[1].innerText);
    });
    const h1 = doc.querySelector("h1");
    const tm = h1 ? clean(h1.innerText).match(/^(.*)\(([A-Za-z0-9]+)\)\s*$/) : null;
    const code = tm ? tm[2].toUpperCase() : null;
    const name = tm ? clean(tm[1]) : null;
    const addr = cells["address"] || "";
    const em = addr.match(/Email:\s*([^\s]+@[^\s]+)/i);
    return {
      code, name,
      slug: url.replace(ORIGIN + "/political-parties/", "").replace(/\/$/, ""),
      chairman: cells["national chairman"] || null,
      secretary: cells["national secretary"] || null,
      treasurer: cells["national treasurer"] || null,
      financialSecretary: cells["national financial secretary"] || null,
      legalAdviser: cells["national legal adviser"] || null,
      address: clean(addr.replace(/Email:.*$/is, "")) || null,
      email: em ? em[1] : null,
      phone: cells["phone number"] || null,
      logoUrl: logo,
      source: url,
    };
  }

  (async () => {
    const links = await partyLinks();
    console.log(`Found ${links.length} party pages. Reading…`);
    const parties = [];
    for (const url of links) {
      try {
        const html = await fetch(url, { credentials: "include" }).then((r) => r.text());
        const p = parse(html, url);
        if (p.code) { parties.push(p); console.log(`✓ ${p.code} — ${p.name}`); }
        else console.warn("skip (no acronym)", url);
      } catch (e) { console.warn("err", url, e); }
      await sleep(150);
    }
    const data = { harvestedAt: new Date().toISOString(), parties };
    const b = document.createElement("button");
    b.textContent = `⬇ Save ${parties.length} parties (inec-party-registry.json)`;
    b.style.cssText = "position:fixed;z-index:99999;top:20px;left:50%;transform:translateX(-50%);padding:16px 26px;font:700 16px system-ui;background:#16a34a;color:#fff;border:0;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);cursor:pointer";
    b.onclick = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = "inec-party-registry.json"; document.body.appendChild(a); a.click(); a.remove();
    };
    document.body.appendChild(b);
    console.log(`Done — ${parties.length} parties. Click the green button to save.`);
  })();
})();
