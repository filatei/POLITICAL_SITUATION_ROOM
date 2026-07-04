"use client";
import { useEffect, useRef, useState } from "react";

export type GeoHit = { type: "unit" | "ward" | "lga"; id: string; name: string; ward?: string; lga?: string; state: string; code?: string };

// Debounced typeahead over /api/public/geo/search. Reused on the landing page and
// in the admin geography tab. onPick fires with the chosen result.
export default function GeoSearch({ onPick, placeholder }: { onPick?: (h: GeoHit) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<GeoHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setRes([]); return; }
    setBusy(true);
    timer.current = setTimeout(async () => {
      try {
        const j = await fetch(`/api/public/geo/search?q=${encodeURIComponent(q.trim())}`).then((r) => r.json());
        setRes(j.results || []);
        setOpen(true);
      } catch { /* ignore */ } finally { setBusy(false); }
    }, 220);
    return () => timer.current && clearTimeout(timer.current);
  }, [q]);

  const badge = (t: string) => (t === "unit" ? "bg-accent/15 text-accent" : t === "ward" ? "bg-good/15 text-good" : "bg-ink/10 text-muted");
  const path = (h: GeoHit) => [h.state, h.lga, h.ward].filter(Boolean).join(" › ");

  return (
    <div className="relative">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => res.length && setOpen(true)}
        placeholder={placeholder || "Search your polling unit, ward or LGA…"} />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-2xl">
          {busy && !res.length && <div className="px-3 py-2 text-sm text-muted">Searching…</div>}
          {!busy && !res.length && <div className="px-3 py-2 text-sm text-muted">No match for “{q}”.</div>}
          {res.map((h) => (
            <button key={h.type + h.id} onClick={() => { onPick?.(h); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 border-b border-line/50 px-3 py-2 text-left last:border-0 hover:bg-ink/5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{h.name}</span>
                <span className="block truncate text-[11px] text-muted">{path(h)}</span>
              </span>
              <span className={`pill shrink-0 ${badge(h.type)}`}>{h.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
