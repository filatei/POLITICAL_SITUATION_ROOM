"use client";
import { useEffect, useMemo, useState } from "react";
import GeoSearch from "@/components/GeoSearch";

type GState = { name: string; lgas: number; wards: number; units: number };
type GLga = { name: string; wards: number; units: number };

// Schematic tile-grid (statebins) placement of the 36 states + FCT — [row, col],
// row 0 = north, col 0 = west. Approximate geography, not exact boundaries.
const LAYOUT: Record<string, [number, number]> = {
  SOKOTO: [0, 1], KATSINA: [0, 3], JIGAWA: [0, 5], YOBE: [0, 6], BORNO: [0, 7],
  KEBBI: [1, 0], ZAMFARA: [1, 2], KANO: [1, 4], BAUCHI: [1, 5], GOMBE: [1, 6],
  NIGER: [2, 1], KADUNA: [2, 3], PLATEAU: [2, 5], ADAMAWA: [2, 7],
  KWARA: [3, 1], FCT: [3, 2], NASARAWA: [3, 4], TARABA: [3, 6],
  OYO: [4, 0], KOGI: [4, 3], BENUE: [4, 5],
  OSUN: [5, 1], EKITI: [5, 2], ENUGU: [5, 4], EBONYI: [5, 5], "CROSS RIVER": [5, 6],
  OGUN: [6, 0], ONDO: [6, 1], EDO: [6, 3], ANAMBRA: [6, 4], IMO: [6, 5], ABIA: [6, 6],
  LAGOS: [7, 0], DELTA: [7, 2], BAYELSA: [7, 3], RIVERS: [7, 4], "AKWA IBOM": [7, 6],
};

// --- Optional real-boundary map: renders if /nigeria-states.geojson exists ---
function featureName(f: any): string {
  const p = f.properties || {};
  return String(p.state || p.name || p.NAME_1 || p.admin1Name || p.STATE || p.state_name || "");
}
function ringsOf(geom: any): number[][][] {
  if (!geom) return [];
  if (geom.type === "Polygon") return geom.coordinates;
  if (geom.type === "MultiPolygon") return geom.coordinates.flat();
  return [];
}
function normState(n: string): string {
  const s = (n || "").toUpperCase().trim();
  if (s.includes("CAPITAL") || s === "ABUJA" || s === "FCT ABUJA") return "FCT";
  return s.replace("NASSARAWA", "NASARAWA");
}
function buildMap(geo: any) {
  const feats = geo?.features || [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of feats) for (const ring of ringsOf(f.geometry)) for (const pt of ring) {
    const [x, y] = pt; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!isFinite(minX)) return null;
  const s = 1000 / Math.max(maxX - minX, maxY - minY);
  const px = (x: number) => (x - minX) * s;
  const py = (y: number) => (maxY - y) * s; // flip
  const shapes = feats.map((f: any) => {
    let d = "";
    for (const ring of ringsOf(f.geometry)) d += "M" + ring.map((pt: number[]) => `${px(pt[0]).toFixed(1)},${py(pt[1]).toFixed(1)}`).join("L") + "Z";
    return { name: featureName(f), d };
  });
  return { shapes, vw: (maxX - minX) * s, vh: (maxY - minY) * s };
}

export default function GeoShowcase() {
  const [totals, setTotals] = useState<{ states: number; lgas: number; wards: number; units: number } | null>(null);
  const [states, setStates] = useState<GState[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [lgasBy, setLgasBy] = useState<Record<string, GLga[]>>({});
  const [geo, setGeo] = useState<any>(null);
  const [cq, setCq] = useState("");
  const [cres, setCres] = useState<{ id: string; type: string; name: string; code: string | null; state: string; composition: string[] }[]>([]);
  const [copen, setCopen] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (cq.trim().length < 2) { setCres([]); return; }
      try {
        const j = await fetch(`/api/public/constituencies/search?q=${encodeURIComponent(cq.trim())}`).then((r) => r.json());
        setCres(j.results || []); setCopen(true);
      } catch { /* ignore */ }
    }, 220);
    return () => clearTimeout(t);
  }, [cq]);

  useEffect(() => {
    fetch("/api/public/geo").then((r) => r.json()).then((j) => { setTotals(j.totals); setStates(j.states || []); }).catch(() => {});
    // Optional real boundaries — add public/nigeria-states.geojson to enable.
    fetch("/nigeria-states.geojson").then((r) => (r.ok ? r.json() : null)).then((g) => g && setGeo(g)).catch(() => {});
  }, []);

  const map = useMemo(() => (geo ? buildMap(geo) : null), [geo]);

  const byName = useMemo(() => new Map(states.map((s) => [s.name.toUpperCase(), s])), [states]);
  const maxUnits = useMemo(() => Math.max(1, ...states.map((s) => s.units)), [states]);

  async function select(name: string) {
    setSel((s) => (s === name ? null : name));
    if (!lgasBy[name]) {
      const j = await fetch(`/api/public/geo?state=${encodeURIComponent(name)}`).then((r) => r.json()).catch(() => ({ lgas: [] }));
      setLgasBy((m) => ({ ...m, [name]: j.lgas || [] }));
    }
  }

  if (!totals || totals.states === 0) return null;
  const tiles: [string, number][] = [["States", totals.states], ["LGAs", totals.lgas], ["Wards", totals.wards], ["Polling Units", totals.units]];
  const shade = (u: number) => `rgb(var(--accent) / ${(0.12 + 0.68 * (u / maxUnits)).toFixed(2)})`;
  const selState = sel ? byName.get(sel.toUpperCase()) : null;

  return (
    <div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div>
          <GeoSearch placeholder="Find your polling unit, ward or LGA…" onPick={(h) => { if (byName.has(h.state.toUpperCase())) select(h.state); }} />
          <p className="mt-1 text-[11px] text-muted">Polling unit, ward or LGA — full State › LGA › Ward › Unit path.</p>
        </div>
        <div>
          <div className="relative">
            <input className="input" value={cq} onChange={(e) => setCq(e.target.value)} onFocus={() => cres.length && setCopen(true)}
              placeholder="Find your constituency or district…" />
            {copen && cq.trim().length >= 2 && (
              <div className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-2xl">
                {!cres.length && <div className="px-3 py-2 text-sm text-muted">No match for “{cq}”.</div>}
                {cres.map((h) => (
                  <button key={h.type + h.id} onClick={() => { if (byName.has(h.state.toUpperCase())) select(h.state); setCopen(false); }}
                    className="flex w-full items-center justify-between gap-2 border-b border-line/50 px-3 py-2 text-left last:border-0 hover:bg-ink/5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{h.name}{h.code ? <span className="ml-1 text-[11px] font-normal text-muted">{h.code}</span> : null}</span>
                      <span className="block truncate text-[11px] text-muted">{h.state}{h.composition?.length ? ` · ${h.composition.slice(0, 4).join(", ")}${h.composition.length > 4 ? "…" : ""}` : ""}</span>
                    </span>
                    <span className={`pill shrink-0 ${h.type === "SENATORIAL" ? "bg-accent/15 text-accent" : h.type === "FEDERAL" ? "bg-good/15 text-good" : "bg-ink/10 text-muted"}`}>{h.type === "SENATORIAL" ? "Senate" : h.type === "FEDERAL" ? "Reps" : "State"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted">Senatorial district, federal or state constituency (INEC).</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="card p-4 text-center">
            <div className="tabular text-2xl font-extrabold tracking-tight sm:text-3xl">{v.toLocaleString()}</div>
            <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{k}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Real boundary choropleth when public/nigeria-states.geojson is present */}
        {map ? (
          <div>
            <svg viewBox={`0 0 ${map.vw.toFixed(0)} ${map.vh.toFixed(0)}`} className="w-full" style={{ maxHeight: 460 }}>
              {map.shapes.map((sh, i) => {
                const st = byName.get(normState(sh.name));
                const active = st && sel === st.name;
                return (
                  <path key={i} d={sh.d}
                    fill={st ? shade(st.units) : "rgb(var(--line) / 0.15)"}
                    stroke={active ? "rgb(var(--accent))" : "rgb(var(--line) / 0.6)"}
                    strokeWidth={active ? 2 : 0.6}
                    style={{ cursor: st ? "pointer" : "default" }}
                    onClick={() => st && select(st.name)}>
                    <title>{st ? `${st.name}: ${st.lgas} LGAs · ${st.units.toLocaleString()} units` : sh.name}</title>
                  </path>
                );
              })}
            </svg>
            <p className="mt-2 text-[11px] text-muted">Shaded by polling-unit density (INEC). Tap a state.</p>
          </div>
        ) : (
        /* Tile map fallback */
        <div className="overflow-x-auto">
          <div className="grid min-w-[560px] gap-1.5" style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gridTemplateRows: "repeat(8, 1fr)" }}>
            {Object.entries(LAYOUT).map(([name, [r, c]]) => {
              const s = byName.get(name);
              const active = sel === name;
              return (
                <button key={name} onClick={() => s && select(name)} disabled={!s}
                  style={{ gridColumn: c + 1, gridRow: r + 1, background: s ? shade(s.units) : "transparent" }}
                  className={`flex aspect-square flex-col items-center justify-center rounded-md border px-1 text-center transition ${active ? "border-accent ring-2 ring-accent/60" : "border-line/50"} ${s ? "cursor-pointer hover:brightness-125" : "cursor-default opacity-30"}`}
                  title={s ? `${name}: ${s.lgas} LGAs · ${s.units.toLocaleString()} units` : `${name} — not imported`}>
                  <span className="text-[9px] font-bold leading-none text-ink">{name.length > 8 ? name.slice(0, 7) + "…" : name}</span>
                  {s && <span className="tabular mt-0.5 text-[8px] leading-none text-ink/80">{(s.units / 1000).toFixed(1)}k</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted">Shaded by polling-unit density. Schematic tile map — tap a state.</p>
        </div>
        )}

        {/* Selected state's LGAs */}
        <div>
          {selState ? (
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold">{selState.name}</h3>
                <span className="text-[11px] text-muted">{selState.lgas} LGAs · {selState.wards.toLocaleString()} wards · {selState.units.toLocaleString()} units</span>
              </div>
              <div className="mt-2 max-h-72 space-y-0.5 overflow-y-auto pr-1">
                {(lgasBy[selState.name] || []).map((l) => (
                  <div key={l.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{l.name}</span>
                    <span className="shrink-0 text-[11px] text-muted">{l.wards} wards · {l.units} units</span>
                  </div>
                ))}
                {!lgasBy[selState.name] && <div className="text-[11px] text-muted">Loading…</div>}
              </div>
            </div>
          ) : (
            <div className="card grid h-full min-h-[200px] place-items-center p-4 text-center text-sm text-muted">
              Tap a state on the map to see its LGAs, wards and polling-unit counts.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
