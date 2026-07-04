import { db } from "@/lib/db";

// Server-side refresh of the INEC party registry (factual party registration
// details). Runs on an app-side monthly cron and on-demand from admin. If INEC
// blocks the server fetch, the browser harvester (scripts/harvest-inec-party-
// details.js) + seed remains the fallback.
const ORIGIN = "https://wp1.inecnigeria.org";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const FIELDS = ["name", "slug", "chairman", "secretary", "treasurer", "financialSecretary", "legalAdviser", "address", "email", "phone", "logoUrl", "source"] as const;

const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#[0-9]+;/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const norm = (v: unknown) => (v == null ? "" : String(v).trim());

async function getHtml(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

function parseParty(html: string, url: string) {
  const h1m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1m ? strip(h1m[1]) : "";
  const tm = title.match(/^(.*)\(([A-Za-z0-9]+)\)\s*$/);
  const code = tm ? tm[2].toUpperCase() : null;
  const name = tm ? tm[1].trim() : null;

  const cells: Record<string, string> = {};
  let logoUrl: string | null = null;
  for (const rm of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...rm[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    if (tds.length < 2) continue;
    const label = strip(tds[0][1]).toLowerCase();
    if (/party logo/.test(label)) {
      const im = rm[1].match(/<img[^>]+src="([^"]+)"/i);
      if (im) logoUrl = im[1];
      continue;
    }
    cells[label] = strip(tds[1][1]);
  }
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
    address: strip(addr.replace(/Email:.*$/is, "")) || null,
    email: em ? em[1] : null,
    phone: cells["phone number"] || null,
    logoUrl, source: url,
  };
}

async function upsert(p: ReturnType<typeof parseParty>) {
  const code = String(p.code || "").toUpperCase().trim();
  if (!code) return { changed: 0, created: false };
  const cur = await db.partyRegistry.findUnique({ where: { code } });
  const data: Record<string, unknown> = { name: p.name || code };
  for (const f of FIELDS) if (f !== "name") data[f] = (p as any)[f] ?? null;
  if (!cur) { await db.partyRegistry.create({ data: { code, ...data, checkedAt: new Date() } as any }); return { changed: 0, created: true }; }
  const diffs = FIELDS.filter((f) => norm((p as any)[f]) !== norm((cur as any)[f]));
  await db.partyRegistry.update({ where: { code }, data: { ...data, checkedAt: new Date() } as any });
  for (const f of diffs) await db.partyRegistryChange.create({ data: { code, field: f, oldValue: norm((cur as any)[f]) || null, newValue: norm((p as any)[f]) || null } });
  return { changed: diffs.length, created: false };
}

export async function refreshPartyRegistry() {
  const idx = await getHtml(ORIGIN + "/political-parties/");
  const links = [...new Set([...idx.matchAll(/href="(https:\/\/wp1\.inecnigeria\.org\/political-parties\/[a-z0-9-]+\/)"/g)].map((m) => m[1]))]
    .filter((u) => !/political-parties\/$/.test(u));
  let created = 0, updated = 0, changes = 0; const errors: string[] = [];
  for (const url of links) {
    try {
      const r = await upsert(parseParty(await getHtml(url), url));
      if (r.created) created++; else if (r.changed) { updated++; changes += r.changed; }
    } catch (e: any) { errors.push(`${url}: ${e?.message || e}`); }
  }
  return { parties: links.length, created, updated, changes, errors };
}
