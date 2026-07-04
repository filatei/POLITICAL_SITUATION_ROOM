"use client";
import { useEffect, useRef, useState } from "react";

// Searchable single-select over { id, label } options. Type to filter; closes on
// outside click. Used for the LGA → Ward → Unit drill-down in admin.
export default function SearchSelect({
  value, onChange, options, placeholder, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const sel = options.find((o) => o.id === value);
  const needle = q.trim().toLowerCase();
  const filtered = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        className="input flex w-full items-center justify-between disabled:opacity-50"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={sel ? "truncate" : "truncate text-muted"}>{sel ? sel.label : (placeholder || "Select…")}</span>
        <span className="ml-2 shrink-0 text-muted">▾</span>
      </button>
      {open && !disabled && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-line bg-surface shadow-xl">
          <input
            autoFocus
            className="input m-2 w-[calc(100%-1rem)]"
            placeholder="Type to filter…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="max-h-64 overflow-auto pb-1">
            {value && (
              <button className="block w-full px-3 py-2 text-left text-sm text-muted hover:bg-ink/10" onClick={() => { onChange(""); setOpen(false); setQ(""); }}>
                Clear
              </button>
            )}
            {filtered.slice(0, 400).map((o) => (
              <button
                key={o.id}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-ink/10 ${o.id === value ? "text-accent" : "text-ink"}`}
                onClick={() => { onChange(o.id); setOpen(false); setQ(""); }}
              >
                {o.label}
              </button>
            ))}
            {!filtered.length && <div className="px-3 py-3 text-sm text-muted">No matches.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
