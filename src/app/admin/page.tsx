"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/session";
import RoomLogin from "@/components/RoomLogin";
import type { Session } from "@/lib/auth";

type Unit = { id: string; name: string; code: string; ward: string; lga: string; label: string; agents: number };
type Lga = { id: string; name: string };
type Agent = { id: string; name: string; phone?: string; inviteCode: string; status: string; unitLabel: string; usedAt?: string | null; lastSeenAt?: string | null };

export default function AdminPage() {
  const [state, setState] = useState<"loading" | "in" | "out" | "denied">("loading");
  const [session, setSession] = useState<Session | null>(null);

  async function check() {
    const r = await api("/api/auth/me");
    if (!r.ok) return setState("out");
    const j = await r.json();
    const role = j.session?.role;
    setSession(j.session);
    setState(role === "ADMIN" || role === "COORDINATOR" ? "in" : "denied");
  }
  useEffect(() => { check(); }, []);

  if (state === "loading") return <main className="grid min-h-dvh place-items-center text-muted">Loading…</main>;
  if (state === "out") return <RoomLogin onDone={check} />;
  if (state === "denied")
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <div className="text-lg font-semibold">Admins only</div>
          <p className="mt-1 text-sm text-muted">Signed in as {session?.name} ({session?.role}). You need an ADMIN or COORDINATOR account.</p>
          <a href="/room" className="mt-4 inline-block text-accent hover:underline">Go to dashboard →</a>
        </div>
      </main>
    );
  return <Console />;
}

function copy(text: string) {
  navigator.clipboard?.writeText(text);
}

function Console() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [lgas, setLgas] = useState<Lga[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [unitId, setUnitId] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [bulkLga, setBulkLga] = useState("");
  const [bulkResult, setBulkResult] = useState<{ name: string; inviteCode: string; unitLabel: string }[] | null>(null);

  async function load() {
    const [u, a] = await Promise.all([api("/api/admin/units"), api("/api/admin/agents")]);
    if (u.ok) { const j = await u.json(); setUnits(j.units); setLgas(j.lgas); }
    if (a.ok) setAgents((await a.json()).agents);
  }
  useEffect(() => { load(); }, []);

  const filteredUnits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? units.filter((u) => u.label.toLowerCase().includes(s)) : units;
  }, [units, q]);

  async function createAgent() {
    if (!name.trim() || !unitId) return;
    setBusy(true);
    const r = await api("/api/admin/agents", { method: "POST", body: JSON.stringify({ name, phone, pollingUnitId: unitId }) });
    setBusy(false);
    const j = await r.json();
    if (r.ok) { setFlash(`Created ${j.agent.name} — code ${j.agent.inviteCode}`); setName(""); setPhone(""); load(); }
    else setFlash(j.error || "Failed");
  }

  async function bulk() {
    if (!bulkLga) return;
    setBusy(true); setBulkResult(null);
    const r = await api("/api/admin/agents/bulk", { method: "POST", body: JSON.stringify({ lgaId: bulkLga }) });
    setBusy(false);
    const j = await r.json();
    if (r.ok) { setBulkResult(j.created); setFlash(`Generated ${j.count} codes`); load(); }
    else setFlash(j.error || "Failed");
  }

  async function reset(id: string) {
    const r = await api(`/api/admin/agents/${id}/reset`, { method: "POST" });
    if (r.ok) { const j = await r.json(); setFlash(`New code: ${j.inviteCode}`); load(); }
  }

  function exportCsv() {
    const rows = [["name", "code", "unit", "status"], ...agents.map((a) => [a.name, a.inviteCode, a.unitLabel, a.status])];
    const csv = rows.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "agent-codes.csv"; link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/80 px-5 py-3.5 backdrop-blur-md">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Admin</div>
          <div className="text-lg font-bold tracking-tight">Agents & access codes</div>
        </div>
        <a href="/room" className="btn-ghost">Dashboard</a>
      </header>

      {flash && <div className="mx-5 mt-4 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm">{flash}</div>}

      <main className="grid gap-4 p-5 lg:grid-cols-3">
        {/* Create one agent */}
        <section className="card p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Register an agent</h2>
          <div className="space-y-3">
            <div><label className="label">Agent name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
            <div><label className="label">Phone (optional)</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="080…" /></div>
            <div>
              <label className="label">Polling unit</label>
              <input className="input mb-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search unit / ward / LGA…" />
              <select className="input" size={6} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                {filteredUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}{u.agents ? ` (${u.agents} agent${u.agents > 1 ? "s" : ""})` : ""}</option>
                ))}
              </select>
            </div>
            <button className="btn-primary w-full" disabled={busy || !name.trim() || !unitId} onClick={createAgent}>Generate access code</button>
          </div>
        </section>

        {/* Bulk generate */}
        <section className="card p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Bulk: one code per unit in an LGA</h2>
          <div className="flex gap-2">
            <select className="input" value={bulkLga} onChange={(e) => setBulkLga(e.target.value)}>
              <option value="">Select LGA…</option>
              {lgas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="btn-primary shrink-0" disabled={busy || !bulkLga} onClick={bulk}>Generate</button>
          </div>
          <p className="mt-2 text-[11px] text-muted">Creates an agent + code for every polling unit in that LGA that doesn't already have one.</p>
          {bulkResult && (
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto border-t border-line pt-3 text-xs">
              {bulkResult.map((r) => (
                <div key={r.inviteCode} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted">{r.unitLabel}</span>
                  <button className="tabular font-semibold text-accent" onClick={() => copy(r.inviteCode)}>{r.inviteCode}</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Agents list */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted">Agents ({agents.length})</h2>
            <button className="text-xs text-accent hover:underline" onClick={exportCsv}>Export CSV</button>
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {agents.map((a) => (
              <div key={a.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{a.name}</div>
                    <div className="truncate text-xs text-muted">{a.unitLabel}</div>
                  </div>
                  <span className={`pill ${a.status === "ACTIVE" ? "bg-good/15 text-good" : a.status === "SUSPENDED" ? "bg-bad/15 text-bad" : "bg-white/5 text-muted"}`}>{a.status}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <button className="tabular rounded-md bg-white/5 px-2 py-1 text-sm font-semibold text-accent" onClick={() => copy(a.inviteCode)} title="Copy code">{a.inviteCode}</button>
                  <button className="text-xs text-muted hover:text-ink" onClick={() => reset(a.id)}>Reset code</button>
                </div>
              </div>
            ))}
            {!agents.length && <p className="text-sm text-muted">No agents yet.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
