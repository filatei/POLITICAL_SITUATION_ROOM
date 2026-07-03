// Thin client for INEC's public polling-unit cascade (JSON endpoints behind the
// dropdowns on inecnigeria.org/polling-units). Used to warehouse national geography.
const BASE = "https://www.inecnigeria.org/wp-content/themes/rishi/custom/views/";
const UA = { "User-Agent": "Mozilla/5.0 (PSR geo importer)" };

export const INEC_STATES = [
  "ABIA", "ADAMAWA", "AKWA IBOM", "ANAMBRA", "BAUCHI", "BAYELSA", "BENUE", "BORNO",
  "CROSS RIVER", "DELTA", "EBONYI", "EDO", "EKITI", "ENUGU", "GOMBE", "IMO", "JIGAWA",
  "KADUNA", "KANO", "KATSINA", "KEBBI", "KOGI", "KWARA", "LAGOS", "NASARAWA", "NIGER",
  "OGUN", "ONDO", "OSUN", "OYO", "PLATEAU", "RIVERS", "SOKOTO", "TARABA", "YOBE",
  "ZAMFARA", "FCT",
];

async function getJson(url: string): Promise<any[]> {
  try {
    const r = await fetch(url, { headers: UA });
    const t = await r.text();
    const j = JSON.parse(t);
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}

const e = encodeURIComponent;

export async function inecLgas(state: string): Promise<string[]> {
  return (await getJson(`${BASE}lgaView.php?state_id=${e(state)}`)).map((x) => String(x.lga)).filter(Boolean);
}
export async function inecWards(state: string, lga: string): Promise<string[]> {
  return (await getJson(`${BASE}wardView.php?state_id=${e(state)}&lga_id=${e(lga)}`)).map((x) => String(x.ward)).filter(Boolean);
}
export type InecUnit = { id: string; pu: string; delim: string; remark?: string };
export async function inecUnits(state: string, lga: string, ward: string): Promise<InecUnit[]> {
  return (await getJson(`${BASE}pollingView.php?state_id=${e(state)}&lga_id=${e(lga)}&ward_id=${e(ward)}`))
    .map((x) => ({ id: String(x.id), pu: String(x.pu || "").trim(), delim: String(x.delim || "").trim(), remark: x.remark }));
}
