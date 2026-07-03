"use client";
import { useState } from "react";

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

export default function Onboard() {
  const [name, setName] = useState("");
  const [type, setType] = useState("GOVERNORSHIP");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<null | { slug: string; name: string; roomPath: string; adminPath: string }>(null);

  const effSlug = touched ? slug : slugify(name);

  async function submit() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/onboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electionName: name, electionType: type, slug: effSlug, contactEmail: email, contactPhone: phone }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.formErrors?.[0] || (typeof j.error === "string" ? j.error : "") || "Could not create your room.");
      setDone(j);
    } catch (e: any) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  }

  if (done) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return (
      <div className="card p-6 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-good/15 text-3xl text-good">✓</div>
        <div className="mt-3 text-lg font-bold">Your situation room is created</div>
        <p className="mt-1 text-sm text-muted"><b className="text-ink">{done.name}</b> — tenant <span className="tabular text-accent">{done.slug}</span></p>
        <div className="mt-4 space-y-1 rounded-lg border border-line bg-white/[0.03] p-3 text-left text-sm">
          <div className="text-muted">Room: <span className="tabular text-ink">{origin}{done.roomPath}</span></div>
          <div className="text-muted">Admin: <span className="tabular text-ink">{origin}{done.adminPath}</span></div>
        </div>
        <p className="mt-3 text-xs text-muted">You have 10 free agent seats to start. Sign in to your admin with the email you provided to add candidates, generate agent codes and buy more seats.</p>
        <a href={done.adminPath} className="btn-primary mt-4 inline-block">Go to my admin →</a>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Contact email (admin)</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="you@org.ng" /></div>
          <div><label className="label">Phone (optional)</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="080…" /></div>
        </div>
        <button className="btn-primary w-full" disabled={busy || name.trim().length < 3 || !email.trim()} onClick={submit}>
          {busy ? "Creating…" : "Create my situation room (10 seats free)"}
        </button>
        <p className="text-center text-[11px] text-muted">Free to start with 10 agent seats. Add more seats (₦10,000 each) any time from your admin.</p>
      </div>
    </div>
  );
}
