"use client";
import { useEffect, useRef, useState } from "react";

type ScopePlan = { level: string; needsState: boolean; needsConstituency: boolean; constituencyType: string | null; constituencyLabel: string | null };
type Opt = { id: string; name: string };
type CItem = { id: string; name: string; code: string | null; lgas: number };

const TYPES: [string, string][] = [
  ["GOVERNORSHIP", "Governorship"],
  ["PRESIDENTIAL", "Presidential"],
  ["SENATORIAL", "Senatorial"],
  ["HOUSE_OF_REPS", "House of Reps"],
  ["STATE_ASSEMBLY", "State Assembly"],
  ["LG_CHAIRMANSHIP", "LG Chairmanship"],
];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); return true; }
    catch { return false; }
  }
}

async function shareLinks(text: string) {
  if (typeof navigator !== "undefined" && (navigator as any).share) {
    try { await (navigator as any).share({ title: "PSR situation room", text }); return; } catch { /* user cancelled — fall through to copy */ }
  }
  if (await copyToClipboard(text)) alert("Links copied — paste them into WhatsApp, email or SMS.");
}

// Searchable single-select (type to filter). Used for the State picker so the
// 37 states are quick to find.
function SearchSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const filtered = q.trim() ? options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase())) : options;
  return (
    <div className="relative" ref={boxRef}>
      <input className="input" value={open ? q : value} placeholder={value || placeholder || "Search…"}
        onFocus={() => { setOpen(true); setQ(""); }} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open && (
        <div className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-2xl">
          {!filtered.length && <div className="px-3 py-2 text-sm text-muted">No match.</div>}
          {filtered.map((o) => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); setQ(""); }}
              className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-ink/5 ${o === value ? "font-semibold text-accent" : ""}`}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// One shareable link with a copy button.
function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (await copyToClipboard(url)) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  }
  return (
    <div className="rounded-lg border border-line bg-white/[0.03] p-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <a href={url} className="min-w-0 flex-1 truncate text-sm text-accent hover:underline" title={url}>{url}</a>
        <button onClick={copy} className="btn-ghost shrink-0 px-2.5 py-1 text-xs">{copied ? "Copied ✓" : "Copy"}</button>
      </div>
    </div>
  );
}

export default function Onboard() {
  const [name, setName] = useState("");
  const [type, setType] = useState("GOVERNORSHIP");
  const [plan, setPlan] = useState<ScopePlan | null>(null);
  const [states, setStates] = useState<Opt[]>([]);
  const [stateName, setStateName] = useState("");
  const [consts, setConsts] = useState<CItem[]>([]);
  const [constId, setConstId] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<null | { slug: string; name: string; roomPath: string; adminPath: string }>(null);

  const effSlug = touched ? slug : slugify(name);

  // Load the scope plan + state list whenever the election type changes.
  useEffect(() => {
    setConstId("");
    fetch(`/api/public/scope?type=${type}`).then((r) => r.json()).then((j) => {
      setPlan(j.plan); setStates(j.states || []);
    }).catch(() => setPlan(null));
  }, [type]);

  // Load the district/constituency options once a state is chosen.
  useEffect(() => {
    setConstId("");
    if (!plan?.needsConstituency || !stateName) { setConsts([]); return; }
    fetch(`/api/public/scope?type=${type}&state=${encodeURIComponent(stateName)}`).then((r) => r.json())
      .then((j) => setConsts(j.constituencies || [])).catch(() => setConsts([]));
  }, [type, stateName, plan?.needsConstituency]);

  const scopeReady = !plan
    || (!plan.needsState && !plan.needsConstituency)
    || (plan.needsState && !plan.needsConstituency && !!stateName)
    || (plan.needsConstituency && !!stateName && !!constId);

  async function submit() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/onboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electionName: name, electionType: type, slug: effSlug, contactEmail: email, contactPhone: phone, scopeState: plan?.needsState ? stateName : "", scopeConstituencyId: plan?.needsConstituency ? constId : "" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.formErrors?.[0] || (typeof j.error === "string" ? j.error : "") || "Could not create your room.");
      setDone(j);
    } catch (e: any) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  }

  if (done) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const roomUrl = origin + done.roomPath;
    const adminUrl = origin + done.adminPath;
    const shareText = `PSR situation room "${done.name}" is live.\n\nSituation room: ${roomUrl}\nAdmin console: ${adminUrl}`;
    return (
      <div className="card p-6">
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-good/15 text-3xl text-good">✓</div>
          <div className="mt-3 text-lg font-bold">Your situation room is created</div>
          <p className="mt-1 text-sm text-muted"><b className="text-ink">{done.name}</b> — tenant <span className="tabular text-accent">{done.slug}</span></p>
        </div>
        <div className="mt-5 space-y-2">
          <LinkRow label="Situation room" url={roomUrl} />
          <LinkRow label="Admin console" url={adminUrl} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a href={done.adminPath} className="btn-primary">Go to my admin →</a>
          <button className="btn-ghost" onClick={() => shareLinks(shareText)}>Share links</button>
          <a className="btn-ghost" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}>WhatsApp</a>
        </div>
        <p className="mt-3 text-xs text-muted">You have 10 free agent seats to start. Sign in to your admin with the email you provided to add candidates, generate agent codes and buy more seats. Keep the admin link private.</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      {err && <div className="mb-3 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{err}</div>}
      <div className="space-y-3">
        <div>
          <label className="label">Election name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ondo South Senatorial 2027" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Election type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Your room address</label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted">/</span>
              <input className="input tabular" value={effSlug} onChange={(e) => { setTouched(true); setSlug(slugify(e.target.value)); }} placeholder="ondosouthsenate2027" />
            </div>
          </div>
        </div>
        {/* Scope — depends on election type */}
        {plan && plan.level === "NATION" && (
          <div className="rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">
            Nationwide contest — monitors all 36 states and the FCT.
          </div>
        )}
        {plan && plan.needsState && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">State</label>
              <SearchSelect value={stateName} onChange={setStateName} options={states.map((s) => s.name)} placeholder="Search state…" />
            </div>
            {plan.needsConstituency && (
              <div>
                <label className="label">{plan.constituencyLabel}</label>
                <select className="input" value={constId} onChange={(e) => setConstId(e.target.value)} disabled={!stateName || !consts.length}>
                  <option value="">{!stateName ? "Choose a state first" : consts.length ? "Select…" : "None warehoused yet"}</option>
                  {consts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.lgas ? ` (${c.lgas} LGAs)` : ""}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        {plan && plan.needsConstituency && stateName && !consts.length && (
          <p className="text-[11px] text-warn">No {plan.constituencyLabel?.toLowerCase()} imported for {stateName} yet. A super-admin can import them under Admin → Geography.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Contact email (admin)</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="you@org.ng" /></div>
          <div><label className="label">Phone (optional)</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="080…" /></div>
        </div>
        <button className="btn-primary w-full" disabled={busy || name.trim().length < 3 || !email.trim() || !scopeReady} onClick={submit}>
          {busy ? "Creating…" : "Create my situation room (10 seats free)"}
        </button>
        <p className="text-center text-[11px] text-muted">Free to start with 10 agent seats. Add more seats (₦10,000 each) any time from your admin.</p>
      </div>
    </div>
  );
}
