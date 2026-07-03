"use client";
import { useEffect, useMemo, useState } from "react";

type GState = { name: string; lgas: number; wards: number; units: number };
type GLga = { name: string; wards: number; units: number };

export default function GeoShowcase() {
  const [totals, setTotals] = useState<{ states: number; lgas: number; wards: number; units: number } | null>(null);
  const [states, setStates] = useState<GState[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [lgasBy, setLgasBy] = useState<Record<string, GLga[]>>({});

  useEffect(() => {
    fetch("/api/public/geo").then((r) => r.json()).then((j) => { setTotals(j.totals); setStates(j.states || []); }).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    return s ? states.filter((x) => x.name.includes(s)) : states;
  }, [q, states]);

  async function toggle(name: string) {
    setOpen((o) => (o === name ? null : name));
    if (!lgasBy[name]) {
      const j = await fetch(`/api/public/geo?state=${encodeURIComponent(name)}`).then((r) => r.json()).catch(() => ({ lgas: [] }));
      setLgasBy((m) => ({ ...m, [name]: j.lgas || [] }));
    }
  }

  if (!totals || totals.states === 0) return null;
  const tiles: [string, number][] = [["States", totals.states], ["LGAs", totals.lgas], ["Wards", totals.wards], ["Polling Units", totals.units]];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="card p-4 text-center">
            <div className="tabular text-2xl font-extrabold tracking-tight sm:text-3xl">{v.toLocaleString()}</div>
            <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{k}</div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <input className="input mb-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a state…" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <div key={s.name} className="card overflow-hidden">
              <button onClick={() => toggle(s.name)} className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-ink/5">
                <span className="font-semibold">{open === s.name ? "▾" : "▸"} {s.name}</span>
                <span className="shrink-0 text-[11px] text-muted">{s.lgas} LGAs · {s.units.toLocaleString()} units</span>
              </button>
              {open === s.name && (
                <div className="max-h-72 overflow-y-auto border-t border-line/60 px-3 py-2">
                  {(lgasBy[s.name] || []).map((l) => (
                    <div key={l.name} className="flex items-center justify-between gap-2 py-1 text-sm">
                      <span className="truncate">{l.name}</span>
                      <span className="shrink-0 text-[11px] text-muted">{l.wards} wards · {l.units} units</span>
                    </div>
                  ))}
                  {!lgasBy[s.name] && <div className="py-1 text-[11px] text-muted">Loading…</div>}
                  {lgasBy[s.name] && !lgasBy[s.name].length && <div className="py-1 text-[11px] text-muted">No LGAs.</div>}
                </div>
              )}
            </div>
          ))}
          {!filtered.length && <p className="text-sm text-muted">No state matches “{q}”.</p>}
        </div>
      </div>
    </div>
  );
}
