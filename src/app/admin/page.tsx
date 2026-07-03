"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, logout } from "@/lib/session";
import RoomLogin from "@/components/RoomLogin";
import QrModal from "@/components/QrModal";
import ThemeToggle from "@/components/ThemeToggle";
import AiChat from "@/components/AiChat";
import type { Session } from "@/lib/auth";

type Unit = { id: string; name: string; code: string; ward: string; lga: string; label: string; agents: number };
type Lga = { id: string; name: string };
type Agent = { id: string; name: string; phone?: string; email?: string | null; inviteCode: string; status: string; unitLabel: string; unit?: string | null; lgaId?: string | null; usedAt?: string | null; lastSeenAt?: string | null };

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
          <div className="mt-5 flex items-center justify-center gap-3">
            <button className="btn-primary" onClick={async () => { await logout(); setSession(null); setState("out"); }}>Sign out & switch account</button>
            <a href="/room" className="btn-ghost">Dashboard</a>
          </div>
        </div>
      </main>
    );
  return <Console session={session!} />;
}

type AdminTab = "codes" | "geo" | "results" | "ai" | "billing" | "settings";

function Console({ session }: { session: Session }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [lgas, setLgas] = useState<Lga[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [unitId, setUnitId] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [tab, setTab] = useState<AdminTab>("codes");
  const [bulkLga, setBulkLga] = useState("");
  const [perUnit, setPerUnit] = useState("1");
  const [bulkResult, setBulkResult] = useState<{ name: string; inviteCode: string; unitLabel: string }[] | null>(null);
  const [qr, setQr] = useState<{ code: string; label?: string } | null>(null);
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const [agentQ, setAgentQ] = useState("");
  const [agentFilter, setAgentFilter] = useState<"all" | "unused" | "active">("all");
  const [edit, setEdit] = useState<{ id: string; name: string; phone: string } | null>(null);

  function copyText(text: string) {
    navigator.clipboard?.writeText(text);
    setFlash(`Copied: ${text}`);
    setTimeout(() => setFlash(""), 2000);
  }

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
    const r = await api("/api/admin/agents", { method: "POST", body: JSON.stringify({ name, phone, email: agentEmail, pollingUnitId: unitId }) });
    setBusy(false);
    const j = await r.json();
    if (r.ok) { setFlash(`Created ${j.agent.name} — code ${j.agent.inviteCode}`); setName(""); setPhone(""); setAgentEmail(""); load(); }
    else setFlash(j.error || "Failed");
  }

  async function bulk() {
    if (!bulkLga) return;
    setBusy(true); setBulkResult(null);
    const r = await api("/api/admin/agents/bulk", { method: "POST", body: JSON.stringify({ lgaId: bulkLga, perUnit: Number(perUnit) || 1 }) });
    setBusy(false);
    const j = await r.json();
    if (r.ok) { setBulkResult(j.created); setFlash(`Generated ${j.count} codes`); load(); }
    else setFlash(j.error || "Failed");
  }

  async function reset(id: string) {
    const r = await api(`/api/admin/agents/${id}/reset`, { method: "POST" });
    if (r.ok) { const j = await r.json(); setFlash(`New code: ${j.inviteCode}`); load(); }
  }

  async function saveRecipient() {
    if (!edit) return;
    const r = await api("/api/admin/agents", { method: "PATCH", body: JSON.stringify({ id: edit.id, name: edit.name, phone: edit.phone }) });
    const j = await r.json();
    if (r.ok) { setFlash(`Assigned to ${j.agent.name}`); setEdit(null); load(); }
    else setFlash(j.error || "Failed");
  }

  // Codes that already exist in the LGA picked for bulk generation.
  const lgaCodes = useMemo(() => (bulkLga ? agents.filter((a) => a.lgaId === bulkLga) : []), [agents, bulkLga]);

  const filteredAgents = useMemo(() => {
    const s = agentQ.trim().toLowerCase();
    return agents.filter((a) => {
      if (agentFilter === "unused" && a.usedAt) return false;
      if (agentFilter === "active" && a.status !== "ACTIVE") return false;
      if (!s) return true;
      return [a.name, a.inviteCode, a.unitLabel, a.email || ""].some((x) => x.toLowerCase().includes(s));
    });
  }, [agents, agentQ, agentFilter]);

  function exportCsv() {
    const rows = [["name", "code", "unit", "email", "phone", "status", "activated", "last_seen"],
      ...agents.map((a) => [a.name, a.inviteCode, a.unitLabel, a.email || "", a.phone || "", a.status, a.usedAt || "", a.lastSeenAt || ""])];
    const csv = rows.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "agent-codes.csv"; link.click();
    URL.revokeObjectURL(url);
  }

  const isAdmin = session.role === "ADMIN";
  const TABS: { key: AdminTab; label: string }[] = [
    { key: "codes", label: "Agents & Codes" },
    { key: "geo", label: "Geography" },
    { key: "results", label: "Results" },
    { key: "ai", label: "AI & Knowledge" },
    ...(isAdmin ? [{ key: "billing" as const, label: "Billing" }, { key: "settings" as const, label: "Settings" }] : []),
  ];
  const tabTitle: Record<AdminTab, string> = {
    codes: "Agents & access codes", geo: "Geography warehouse", results: "Results & tally",
    ai: "AI & knowledge base", billing: "Seats & billing", settings: "Branding & staff",
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/80 px-5 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <img src="/psr-logo.png" alt="PSR" className="h-7 w-auto max-w-[110px] shrink-0 object-contain" />
          <div className="border-l border-line pl-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Admin</div>
            <div className="text-lg font-bold tracking-tight">{tabTitle[tab]}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a href="/room" className="btn-ghost">Dashboard</a>
        </div>
      </header>

      <nav className="sticky top-[57px] z-[9] flex gap-1 overflow-x-auto border-b border-line bg-surface/85 px-3 py-2 backdrop-blur-md">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/40" : "text-muted hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {flash && <div className="mx-5 mt-4 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm">{flash}</div>}

      {tab === "codes" && (
      <main className="grid gap-4 p-5 lg:grid-cols-3">
        {/* Create one agent */}
        <section className="card p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Register an agent</h2>
          <div className="space-y-3">
            <div><label className="label">Agent name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
            <div><label className="label">Phone (optional)</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="080…" /></div>
            <div><label className="label">Google email (optional — lets them sign in with Google)</label><input className="input" value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} inputMode="email" placeholder="agent@gmail.com" /></div>
            <div>
              <label className="label">Polling unit {unitId && <span className="text-good">· selected</span>}</label>
              <input className="input mb-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search unit / ward / LGA…" />
              <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
                {filteredUnits.map((u) => (
                  <button type="button" key={u.id} onClick={() => setUnitId(u.id)}
                    className={`flex w-full items-center justify-between gap-2 border-b border-line/60 px-3 py-2 text-left text-sm last:border-0 ${unitId === u.id ? "bg-accent/15 font-semibold text-ink" : "text-muted hover:bg-ink/5"}`}>
                    <span className="truncate">{u.label}</span>
                    {u.agents ? <span className="pill shrink-0 bg-ink/10 text-muted">{u.agents}</span> : null}
                  </button>
                ))}
                {!filteredUnits.length && <div className="px-3 py-3 text-sm text-muted">No matching units.</div>}
              </div>
            </div>
            <button className="btn-primary w-full" disabled={busy || !name.trim() || !unitId} onClick={createAgent}>Generate access code</button>
          </div>
        </section>

        {/* Bulk generate */}
        <section className="card p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Bulk: codes per unit in an LGA</h2>
          <select className="input mb-2" value={bulkLga} onChange={(e) => setBulkLga(e.target.value)}>
            <option value="">Select LGA…</option>
            {lgas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <div className="flex items-end gap-2">
            <div className="w-32">
              <label className="label">Codes / unit</label>
              <input className="input tabular" type="number" min={1} max={10} value={perUnit} onChange={(e) => setPerUnit(e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
            <button className="btn-primary flex-1" disabled={busy || !bulkLga} onClick={bulk}>{busy ? "Generating…" : "Generate"}</button>
          </div>
          <p className="mt-2 text-[11px] text-muted">Mints this many <b>fresh</b> codes for <b>every</b> unit in the LGA. Run it again to add more — existing codes are kept, new distinct ones are added.</p>

          {bulkLga && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted">
                <span>Existing codes here</span>
                <span>{lgaCodes.length} · {lgaCodes.filter((a) => a.usedAt).length} in use</span>
              </div>
              {lgaCodes.length ? (
                <div className="max-h-52 space-y-1 overflow-y-auto text-xs">
                  {lgaCodes.map((a) => (
                    <button key={a.id} className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-ink/5"
                      onClick={() => setOpenAgent(a.id)} title="Open code details">
                      <span className="min-w-0">
                        <span className="tabular block font-semibold text-accent">{a.inviteCode}</span>
                        <span className="block truncate text-muted">{a.usedAt ? `Used by ${a.name} · ${a.unit || a.unitLabel}` : `Unused · ${a.unit || a.unitLabel}`}</span>
                      </span>
                      <span className={`pill shrink-0 ${a.status === "ACTIVE" ? "bg-good/15 text-good" : a.usedAt ? "bg-warn/15 text-warn" : "bg-ink/5 text-muted"}`}>{a.usedAt ? (a.status === "ACTIVE" ? "active" : "used") : "free"}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-xs text-muted">No codes generated for this LGA yet.</p>}
            </div>
          )}
          {bulkResult && (
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto border-t border-line pt-3 text-xs">
              {bulkResult.map((r) => (
                <button key={r.inviteCode} className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-ink/5"
                  onClick={() => setQr({ code: r.inviteCode, label: r.unitLabel })} title="Show QR / copy">
                  <span className="truncate text-muted">{r.unitLabel}</span>
                  <span className="tabular shrink-0 font-semibold text-accent">{r.inviteCode}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Agents / code history */}
        <section className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted">Codes ({filteredAgents.length}/{agents.length})</h2>
            <button className="text-xs text-accent hover:underline" onClick={exportCsv}>Export CSV</button>
          </div>
          <input className="input mb-2" value={agentQ} onChange={(e) => setAgentQ(e.target.value)} placeholder="Search name / code / unit / email…" />
          <div className="mb-3 flex gap-1 rounded-lg border border-line bg-black/20 p-1 text-xs">
            {(["all", "unused", "active"] as const).map((f) => (
              <button key={f} onClick={() => setAgentFilter(f)}
                className={`flex-1 rounded-md px-2 py-1.5 font-semibold capitalize transition ${agentFilter === f ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/40" : "text-muted"}`}>{f}</button>
            ))}
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {filteredAgents.map((a) => (
              <div key={a.id} onClick={() => { if (edit?.id !== a.id) setOpenAgent(a.id); }}
                className="cursor-pointer rounded-lg border border-line p-3 transition hover:border-accent/40 hover:bg-ink/5" title="Open code details">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{a.name}</div>
                    <div className="truncate text-xs text-muted">{a.unitLabel}</div>
                    {a.email && <div className="truncate text-[11px] text-accent">🔑 {a.email}</div>}
                    {a.phone && <div className="truncate text-[11px] text-muted">📞 {a.phone}</div>}
                    <div className="mt-0.5 text-[10px] text-muted">
                      {a.usedAt ? `Used ${new Date(a.usedAt).toLocaleString()}` : "Not used yet"}
                      {a.lastSeenAt ? ` · seen ${new Date(a.lastSeenAt).toLocaleString()}` : ""}
                    </div>
                  </div>
                  <span className={`pill shrink-0 ${a.status === "ACTIVE" ? "bg-good/15 text-good" : a.status === "SUSPENDED" ? "bg-bad/15 text-bad" : "bg-ink/5 text-muted"}`}>{a.status}</span>
                </div>

                {edit?.id === a.id ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-2" onClick={(e) => e.stopPropagation()}>
                    <input className="input py-1 text-sm" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Recipient name" />
                    <input className="input py-1 text-sm" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} inputMode="tel" placeholder="Recipient phone (optional)" />
                    <div className="flex gap-2">
                      <button className="btn-primary flex-1 py-1.5 text-sm" onClick={saveRecipient}>Save recipient</button>
                      <button className="btn-ghost py-1.5 text-sm" onClick={() => setEdit(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="tabular rounded-md bg-ink/5 px-2 py-1 text-sm font-semibold text-accent">{a.inviteCode} ⧉</span>
                    <div className="flex items-center gap-3 text-xs" onClick={(e) => e.stopPropagation()}>
                      <button className="text-muted hover:text-ink" onClick={() => setEdit({ id: a.id, name: a.name, phone: a.phone || "" })}>Assign</button>
                      <button className="text-muted hover:text-ink" onClick={() => reset(a.id)}>Reset code</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!filteredAgents.length && <p className="text-sm text-muted">No codes match.</p>}
          </div>
        </section>
      </main>
      )}

      {tab === "geo" && (
        <div className="space-y-4 p-5">
          <GeoConsole onFlash={setFlash} onOpenAgent={(id) => setOpenAgent(id)} />
          {isAdmin && <WarehouseCard onFlash={setFlash} />}
        </div>
      )}

      {tab === "results" && (
        <div className="space-y-4 p-5">
          <TallyOverride units={units} onFlash={setFlash} />
        </div>
      )}

      {tab === "ai" && (
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">AI assistant — Act, app & field data</h2>
            <AiChat />
          </section>
          {isAdmin && <KnowledgeCard onFlash={setFlash} />}
        </div>
      )}

      {tab === "billing" && isAdmin && (
        <div className="space-y-4 p-5"><BillingCard onFlash={setFlash} /></div>
      )}

      {tab === "settings" && isAdmin && (
        <div className="space-y-4 p-5">
          <BrandingCard onFlash={setFlash} />
          <StaffUsers onFlash={setFlash} />
        </div>
      )}

      {qr && <QrModal code={qr.code} label={qr.label} onClose={() => setQr(null)} onCopy={copyText} />}
      {openAgent && <AgentDetailModal id={openAgent} onClose={() => { setOpenAgent(null); load(); }} onFlash={setFlash} onQr={(code, label) => setQr({ code, label })} onCopy={copyText} />}
    </div>
  );
}

type Cand = { id: string; name: string; party: string; color: string };
type Override = { id: string; pollingUnitId: string; unitLabel: string; by: string; at: string; scores: { candidateId: string; votes: number }[]; accreditedVoters?: number | null; totalVotesCast?: number | null; rejectedBallots?: number | null };

function TallyOverride({ units, onFlash }: { units: Unit[]; onFlash: (s: string) => void }) {
  const [cands, setCands] = useState<Cand[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [q, setQ] = useState("");
  const [unitId, setUnitId] = useState("");
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [acc, setAcc] = useState(""); const [cast, setCast] = useState(""); const [rej, setRej] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api("/api/admin/tally-override");
    if (r.ok) { const j = await r.json(); setCands(j.candidates); setOverrides(j.overrides); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? units.filter((u) => u.label.toLowerCase().includes(s)) : units;
  }, [units, q]);

  function pickUnit(id: string) {
    setUnitId(id);
    const ex = overrides.find((o) => o.pollingUnitId === id);
    if (ex) {
      const v: Record<string, string> = {};
      ex.scores.forEach((x) => { v[x.candidateId] = String(x.votes); });
      setVotes(v);
      setAcc(ex.accreditedVoters != null ? String(ex.accreditedVoters) : "");
      setCast(ex.totalVotesCast != null ? String(ex.totalVotesCast) : "");
      setRej(ex.rejectedBallots != null ? String(ex.rejectedBallots) : "");
    } else { setVotes({}); setAcc(""); setCast(""); setRej(""); }
  }

  const total = cands.reduce((s, c) => s + (Number(votes[c.id]) || 0), 0);

  async function save() {
    if (!unitId || total <= 0) return;
    setBusy(true);
    const scores = cands.map((c) => ({ candidateId: c.id, votes: Number(votes[c.id]) || 0 })).filter((x) => x.votes > 0);
    const body: any = { pollingUnitId: unitId, scores };
    if (acc) body.accreditedVoters = Number(acc);
    if (cast) body.totalVotesCast = Number(cast);
    if (rej) body.rejectedBallots = Number(rej);
    const r = await api("/api/admin/tally-override", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    const j = await r.json();
    if (r.ok) { onFlash(j.edited ? "Official result updated" : "Official result recorded"); setUnitId(""); setVotes({}); setAcc(""); setCast(""); setRej(""); load(); }
    else onFlash(j.error?.formErrors?.[0] || j.error || "Failed");
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Official result override</h2>
      <p className="mb-3 text-[11px] text-muted">Enter a verified result straight from the physical form. It feeds the room tally as a VERIFIED result and every entry is logged with your name and time.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="label">Polling unit {unitId && <span className="text-good">· selected{overrides.some((o) => o.pollingUnitId === unitId) ? " (editing existing)" : ""}</span>}</label>
          <input className="input mb-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search unit / ward / LGA…" />
          <div className="max-h-52 overflow-y-auto rounded-lg border border-line">
            {filtered.map((u) => (
              <button type="button" key={u.id} onClick={() => pickUnit(u.id)}
                className={`flex w-full items-center justify-between gap-2 border-b border-line/60 px-3 py-2 text-left text-sm last:border-0 ${unitId === u.id ? "bg-accent/15 font-semibold text-ink" : "text-muted hover:bg-ink/5"}`}>
                <span className="truncate">{u.label}</span>
                {overrides.some((o) => o.pollingUnitId === u.id) && <span className="pill shrink-0 bg-good/15 text-good">set</span>}
              </button>
            ))}
            {!filtered.length && <div className="px-3 py-3 text-sm text-muted">No matching units.</div>}
          </div>
        </div>

        <div>
          <label className="label">Votes per party</label>
          <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
            {cands.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-sm font-bold" style={{ color: c.color }}>{c.party}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{c.name}</span>
                <input className="input tabular w-24 py-1 text-right" inputMode="numeric" value={votes[c.id] ?? ""}
                  onChange={(e) => setVotes((v) => ({ ...v, [c.id]: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="0" disabled={!unitId} />
              </div>
            ))}
            {!cands.length && <p className="text-sm text-muted">No candidates.</p>}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div><label className="label">Accredited</label><input className="input tabular py-1" inputMode="numeric" value={acc} onChange={(e) => setAcc(e.target.value.replace(/[^0-9]/g, ""))} disabled={!unitId} /></div>
            <div><label className="label">Cast</label><input className="input tabular py-1" inputMode="numeric" value={cast} onChange={(e) => setCast(e.target.value.replace(/[^0-9]/g, ""))} disabled={!unitId} /></div>
            <div><label className="label">Rejected</label><input className="input tabular py-1" inputMode="numeric" value={rej} onChange={(e) => setRej(e.target.value.replace(/[^0-9]/g, ""))} disabled={!unitId} /></div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted">Total entered: <b className="tabular text-ink">{total.toLocaleString()}</b></span>
            <button className="btn-primary" disabled={busy || !unitId || total <= 0} onClick={save}>{busy ? "Saving…" : "Record official result"}</button>
          </div>
        </div>
      </div>

      {overrides.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">Recorded results ({overrides.length})</h3>
          <div className="max-h-56 space-y-1 overflow-y-auto text-xs">
            {overrides.map((o) => (
              <button key={o.id} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-ink/5" onClick={() => pickUnit(o.pollingUnitId)}>
                <span className="min-w-0"><span className="block truncate text-ink">{o.unitLabel}</span><span className="text-muted">by {o.by} · {new Date(o.at).toLocaleString()}</span></span>
                <span className="tabular shrink-0 font-semibold text-accent">{o.scores.reduce((s, x) => s + x.votes, 0).toLocaleString()} votes</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

type StaffUser = { id: string; email: string; name: string; role: string; hasPassword: boolean; hasGoogle: boolean; createdAt: string };

function StaffUsers({ onFlash }: { onFlash: (s: string) => void }) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "COORDINATOR" | "ANALYST">("ANALYST");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState("");

  async function load() {
    const r = await api("/api/admin/users");
    if (r.ok) setUsers((await r.json()).users);
  }
  useEffect(() => { load(); }, []);

  function edit(u: StaffUser) {
    setEditingId(u.id); setName(u.name); setEmail(u.email); setRole(u.role as any); setPassword("");
  }
  function reset() { setEditingId(""); setName(""); setEmail(""); setRole("ANALYST"); setPassword(""); }

  async function save() {
    if (!name.trim() || !email.trim() || (!editingId && password.length < 6)) {
      onFlash(!editingId && password.length < 6 ? "New staff need a password (min 6 chars)." : "Enter a name and email.");
      return;
    }
    setBusy(true);
    const body: any = { name, email, role };
    if (password) body.password = password;
    const r = await api("/api/admin/users", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    const j = await r.json();
    if (r.ok) { onFlash(j.edited ? `Updated ${j.user.email}` : `Enrolled ${j.user.email} as ${j.user.role}`); reset(); load(); }
    else onFlash(j.error?.formErrors?.[0] || j.error?.fieldErrors?.password?.[0] || j.error || "Failed");
  }

  const roleColor: Record<string, string> = { ADMIN: "bg-accent/15 text-accent", COORDINATOR: "bg-good/15 text-good", ANALYST: "bg-ink/10 text-muted" };

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Staff accounts</h2>
      <p className="mb-3 text-[11px] text-muted">Enrol room staff with an email + password. They sign in on the staff screen. Admins manage everything; Coordinators &amp; Analysts can verify scores and see the room.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div><label className="label">Full name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" /></div>
          <div><label className="label">Email {editingId && <span className="text-muted">· sign-in unchanged</span>}</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="jane@org.ng" disabled={!!editingId} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Role</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as any)}>
                <option value="ADMIN">Admin</option>
                <option value="COORDINATOR">Coordinator</option>
                <option value="ANALYST">Analyst</option>
              </select>
            </div>
            <div><label className="label">{editingId ? "New password (optional)" : "Password"}</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editingId ? "leave blank to keep" : "min 6 chars"} /></div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy} onClick={save}>{busy ? "Saving…" : editingId ? "Save changes" : "Enrol staff"}</button>
            {editingId && <button className="btn-ghost" onClick={reset}>Cancel</button>}
          </div>
        </div>

        <div>
          <label className="label">Enrolled staff ({users.length})</label>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {users.map((u) => (
              <button key={u.id} onClick={() => edit(u)} className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left ${editingId === u.id ? "border-accent/50 bg-accent/10" : "border-line hover:bg-ink/5"}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{u.name}</span>
                  <span className="block truncate text-xs text-muted">{u.email}{u.hasGoogle ? " · Google" : ""}{u.hasPassword ? "" : " · no password set"}</span>
                </span>
                <span className={`pill shrink-0 ${roleColor[u.role] || "bg-ink/10 text-muted"}`}>{u.role}</span>
              </button>
            ))}
            {!users.length && <p className="text-sm text-muted">No staff yet.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------- Geography drill-down: LGA → Ward → Unit -------- */
type GLga = { id: string; name: string; wards: number; units: number; codes: number };
type GWard = { id: string; name: string; code: string; units: number; codes: number };
type GUnit = { id: string; name: string; code: string; codes: number; used: number; active: number; reports: number };
type GUnitDetail = {
  unit: { id: string; name: string; label: string; ward: string; lga: string; registeredVoters: number };
  codes: { id: string; name: string; inviteCode: string; status: string; email?: string | null; phone?: string | null; usedAt?: string | null; lastSeenAt?: string | null }[];
  submissions: { id: string; type: string; text?: string; severity?: string; confidence?: string; scoreStatus?: string; receivedAt: string; scores: { party: string; color: string; votes: number }[]; media: { url: string; thumbUrl?: string; mime: string; kind: string }[] }[];
};

function GeoConsole({ onFlash, onOpenAgent }: { onFlash: (s: string) => void; onOpenAgent: (id: string) => void }) {
  const [lgas, setLgas] = useState<GLga[]>([]);
  const [lga, setLga] = useState<GLga | null>(null);
  const [wards, setWards] = useState<GWard[]>([]);
  const [ward, setWard] = useState<GWard | null>(null);
  const [units, setUnits] = useState<GUnit[]>([]);
  const [detail, setDetail] = useState<GUnitDetail | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api("/api/admin/geo").then(async (r) => r.ok && setLgas((await r.json()).lgas)); }, []);

  async function openLga(l: GLga) { setLga(l); setWard(null); setDetail(null); setUnits([]); const r = await api(`/api/admin/geo?lgaId=${l.id}`); if (r.ok) setWards((await r.json()).wards); }
  async function openWard(w: GWard) { setWard(w); setDetail(null); const r = await api(`/api/admin/geo?wardId=${w.id}`); if (r.ok) setUnits((await r.json()).units); }
  async function openUnit(u: GUnit) { const r = await api(`/api/admin/geo?unitId=${u.id}`); if (r.ok) setDetail(await r.json()); }
  async function refreshDetail() { if (detail) { const r = await api(`/api/admin/geo?unitId=${detail.unit.id}`); if (r.ok) setDetail(await r.json()); } }

  async function genForUnit() {
    if (!detail) return;
    setBusy(true);
    const r = await api("/api/admin/agents", { method: "POST", body: JSON.stringify({ name: `${detail.unit.name} · Agent`, pollingUnitId: detail.unit.id }) });
    setBusy(false);
    const j = await r.json();
    if (r.ok) { onFlash(`New code ${j.agent.inviteCode}`); refreshDetail(); } else onFlash(j.error || "Failed");
  }

  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString() : "");
  const typeColor: Record<string, string> = { INCIDENT: "bg-bad/10 text-bad", SCORE: "bg-accent/10 text-accent", MESSAGE: "bg-ink/10 text-ink", STATUS: "bg-ink/10 text-muted" };

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center gap-1.5 text-xs">
        <button className={`font-semibold ${lga ? "text-accent hover:underline" : "text-ink"}`} onClick={() => { setLga(null); setWard(null); setDetail(null); }}>All LGAs</button>
        {lga && <><span className="text-muted">/</span><button className={`font-semibold ${ward ? "text-accent hover:underline" : "text-ink"}`} onClick={() => { setWard(null); setDetail(null); }}>{lga.name}</button></>}
        {ward && <><span className="text-muted">/</span><button className={`font-semibold ${detail ? "text-accent hover:underline" : "text-ink"}`} onClick={() => setDetail(null)}>{ward.name}</button></>}
        {detail && <><span className="text-muted">/</span><span className="font-semibold text-ink">{detail.unit.name}</span></>}
      </div>

      {/* Unit detail */}
      {detail ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">{detail.unit.label}</h3>
              <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={genForUnit}>{busy ? "…" : "+ Code"}</button>
            </div>
            <p className="mb-2 text-[11px] text-muted">Registered voters: {detail.unit.registeredVoters.toLocaleString()} · {detail.codes.length} code{detail.codes.length === 1 ? "" : "s"}</p>
            <div className="space-y-1.5">
              {detail.codes.map((c) => (
                <button key={c.id} onClick={() => onOpenAgent(c.id)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-line p-2 text-left hover:bg-ink/5">
                  <span className="min-w-0">
                    <span className="tabular block font-semibold text-accent">{c.inviteCode}</span>
                    <span className="block truncate text-[11px] text-muted">{c.name}{c.lastSeenAt ? ` · seen ${fmt(c.lastSeenAt)}` : ""}</span>
                  </span>
                  <span className={`pill shrink-0 ${c.status === "ACTIVE" ? "bg-good/15 text-good" : c.usedAt ? "bg-warn/15 text-warn" : "bg-ink/5 text-muted"}`}>{c.status === "ACTIVE" ? "active" : c.usedAt ? "used" : "free"}</span>
                </button>
              ))}
              {!detail.codes.length && <p className="text-xs text-muted">No codes for this unit yet.</p>}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Reports here ({detail.submissions.length})</h3>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {detail.submissions.map((it) => (
                <div key={it.id} className={`rounded-lg border p-2.5 ${it.type === "INCIDENT" ? "border-bad/40 bg-bad/[0.04]" : "border-line"}`}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`pill ${typeColor[it.type] || "bg-ink/10"}`}>{it.type}</span>
                    <span className="text-muted">{fmt(it.receivedAt)}</span>
                  </div>
                  {it.text && <div className="mt-1 text-sm">{it.text}</div>}
                  {!!it.scores.filter((s) => s.votes > 0).length && (
                    <div className="mt-1.5 flex flex-wrap gap-1 text-xs">
                      {it.scores.filter((s) => s.votes > 0).sort((a, b) => b.votes - a.votes).map((s, i) => (
                        <span key={i} className="rounded bg-white/5 px-1.5 py-0.5"><b>{s.party}</b> {s.votes.toLocaleString()}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {!detail.submissions.length && <p className="text-xs text-muted">No reports from this unit yet.</p>}
            </div>
          </div>
        </div>
      ) : units.length || ward ? (
        <>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Units in {ward?.name}</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {units.map((u) => (
              <button key={u.id} onClick={() => openUnit(u)} className="rounded-lg border border-line p-3 text-left hover:bg-ink/5">
                <div className="truncate text-sm font-semibold">{u.name}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted">
                  <span className="pill bg-ink/10">{u.codes} code{u.codes === 1 ? "" : "s"}</span>
                  {u.active > 0 && <span className="pill bg-good/15 text-good">{u.active} active</span>}
                  <span className="pill bg-ink/10">{u.reports} report{u.reports === 1 ? "" : "s"}</span>
                </div>
              </button>
            ))}
            {!units.length && <p className="text-xs text-muted">No units in this ward.</p>}
          </div>
        </>
      ) : lga ? (
        <>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Wards in {lga.name}</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {wards.map((w) => (
              <button key={w.id} onClick={() => openWard(w)} className="rounded-lg border border-line p-3 text-left hover:bg-ink/5">
                <div className="truncate text-sm font-semibold">{w.name}</div>
                <div className="mt-1 flex gap-1 text-[11px] text-muted">
                  <span className="pill bg-ink/10">{w.units} unit{w.units === 1 ? "" : "s"}</span>
                  <span className="pill bg-ink/10">{w.codes} code{w.codes === 1 ? "" : "s"}</span>
                </div>
              </button>
            ))}
            {!wards.length && <p className="text-xs text-muted">No wards.</p>}
          </div>
        </>
      ) : (
        <>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Geography — drill down to administer units</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lgas.map((l) => (
              <button key={l.id} onClick={() => openLga(l)} className="rounded-lg border border-line p-3 text-left hover:bg-ink/5">
                <div className="truncate text-sm font-semibold">{l.name}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted">
                  <span className="pill bg-ink/10">{l.wards} wards</span>
                  <span className="pill bg-ink/10">{l.units} units</span>
                  <span className="pill bg-ink/10">{l.codes} codes</span>
                </div>
              </button>
            ))}
            {!lgas.length && <p className="text-xs text-muted">Loading…</p>}
          </div>
        </>
      )}
    </section>
  );
}

/* -------- Agent / code detail: activity + coordinates -------- */
type ActSub = { id: string; type: string; text?: string; severity?: string; confidence?: string; scoreStatus?: string; receivedAt: string; capturedAt?: string; lat?: number | null; lng?: number | null; scores: { party: string; color: string; votes: number }[]; media: { url: string; thumbUrl?: string; mime: string; kind: string }[] };

function AgentDetailModal({ id, onClose, onFlash, onQr, onCopy }: { id: string; onClose: () => void; onFlash: (s: string) => void; onQr: (code: string, label?: string) => void; onCopy: (t: string) => void }) {
  const [data, setData] = useState<{ agent: any; counts: any; submissions: ActSub[] } | null>(null);
  const [edit, setEdit] = useState<{ name: string; phone: string } | null>(null);

  async function load() { const r = await api(`/api/admin/agents/${id}/activity`); if (r.ok) setData(await r.json()); }
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  async function saveRecipient() {
    if (!edit) return;
    const r = await api("/api/admin/agents", { method: "PATCH", body: JSON.stringify({ id, name: edit.name, phone: edit.phone }) });
    if (r.ok) { onFlash("Recipient saved"); setEdit(null); load(); } else onFlash("Failed");
  }

  const a = data?.agent;
  const fmt = (s?: string) => (s ? new Date(s).toLocaleString() : "");
  const typeColor: Record<string, string> = { INCIDENT: "bg-bad/10 text-bad", SCORE: "bg-accent/10 text-accent", MESSAGE: "bg-ink/10 text-ink", STATUS: "bg-ink/10 text-muted" };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="sheet-in card my-6 w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="tabular text-lg font-extrabold text-accent">{a?.inviteCode || "…"}</div>
            <div className="truncate text-sm font-semibold">{a?.name}</div>
            <div className="truncate text-xs text-muted">{a?.unitLabel}</div>
          </div>
          <button className="text-muted hover:text-ink" onClick={onClose}>✕</button>
        </div>

        {a && (
          <>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className={`pill ${a.status === "ACTIVE" ? "bg-good/15 text-good" : a.usedAt ? "bg-warn/15 text-warn" : "bg-ink/5 text-muted"}`}>{a.status}</span>
              {a.email && <span className="pill bg-accent/10 text-accent">🔑 {a.email}</span>}
              {a.phone && <span className="pill bg-ink/10 text-muted">📞 {a.phone}</span>}
              {a.lastSeenAt && <span className="pill bg-ink/10 text-muted">seen {fmt(a.lastSeenAt)}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-ghost text-xs" onClick={() => onCopy(a.inviteCode)}>Copy code</button>
              <button className="btn-ghost text-xs" onClick={() => onQr(a.inviteCode, `${a.name} · ${a.unitLabel}`)}>Show QR</button>
              <button className="btn-ghost text-xs" onClick={() => onCopy(`${a.unitLabel}\nSign in: ${window.location.origin}/agent/login?code=${a.inviteCode}`)}>Copy login link + unit</button>
              <button className="btn-ghost text-xs" onClick={() => setEdit({ name: a.name, phone: a.phone || "" })}>Assign recipient</button>
            </div>
            {edit && (
              <div className="mt-2 space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-2">
                <input className="input py-1 text-sm" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Recipient name" />
                <input className="input py-1 text-sm" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} inputMode="tel" placeholder="Recipient phone" />
                <div className="flex gap-2"><button className="btn-primary flex-1 py-1.5 text-sm" onClick={saveRecipient}>Save</button><button className="btn-ghost py-1.5 text-sm" onClick={() => setEdit(null)}>Cancel</button></div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
              <div><div className="tabular text-lg font-bold">{data!.counts.scores}</div><div className="text-[11px] uppercase text-muted">Scores</div></div>
              <div><div className="tabular text-lg font-bold">{data!.counts.messages}</div><div className="text-[11px] uppercase text-muted">Messages</div></div>
              <div><div className="tabular text-lg font-bold text-bad">{data!.counts.incidents}</div><div className="text-[11px] uppercase text-muted">Incidents</div></div>
            </div>

            <h3 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-muted">Everything this agent sent</h3>
            <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {data!.submissions.map((it) => (
                <div key={it.id} className={`rounded-lg border p-3 ${it.type === "INCIDENT" ? "border-bad/40 bg-bad/[0.04]" : "border-line"}`}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`pill ${typeColor[it.type] || "bg-ink/10"}`}>{it.type}{it.confidence ? ` · ${it.confidence}` : ""}</span>
                    <span className="text-muted">{fmt(it.receivedAt)}</span>
                  </div>
                  {it.text && <div className="mt-1 text-sm">{it.text}</div>}
                  {it.severity && <span className="pill mt-1 bg-warn/15 text-warn">{it.severity}</span>}
                  {!!it.scores.filter((s) => s.votes > 0).length && (
                    <div className="mt-1.5 flex flex-wrap gap-1 text-xs">
                      {it.scores.filter((s) => s.votes > 0).sort((x, y) => y.votes - x.votes).map((s, i) => (
                        <span key={i} className="rounded bg-white/5 px-1.5 py-0.5"><b style={{ color: s.color }}>{s.party}</b> {s.votes.toLocaleString()}</span>
                      ))}
                    </div>
                  )}
                  {!!it.media.length && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {it.media.map((m, i) => m.mime.startsWith("video/")
                        ? <video key={i} src={m.url} controls className="h-20 rounded border border-line" />
                        : m.mime.startsWith("audio/")
                          ? <audio key={i} src={m.url} controls className="w-full" />
                          : <a key={i} href={m.url} target="_blank" rel="noreferrer"><img src={m.thumbUrl || m.url} className="h-20 rounded border border-line object-cover" alt={m.kind} /></a>)}
                    </div>
                  )}
                  {it.lat != null && it.lng != null ? (
                    <a href={`https://www.google.com/maps?q=${it.lat},${it.lng}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                      📍 {it.lat.toFixed(5)}, {it.lng.toFixed(5)} — open in Maps
                    </a>
                  ) : <div className="mt-2 text-[11px] text-muted">📍 No coordinates captured</div>}
                </div>
              ))}
              {!data!.submissions.length && <p className="text-sm text-muted">This code hasn&apos;t sent anything yet.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* -------- AI knowledge base: load the Electoral Act & curated facts -------- */
function KnowledgeCard({ onFlash }: { onFlash: (s: string) => void }) {
  const [sources, setSources] = useState<{ source: string; chunks: number }[]>([]);
  const [text, setText] = useState("");
  const [src, setSrc] = useState("electoral-act-2022-full");
  const [busy, setBusy] = useState(false);

  async function load() { const r = await api("/api/admin/knowledge"); if (r.ok) setSources((await r.json()).sources); }
  useEffect(() => { load(); }, []);

  async function seed() {
    setBusy(true);
    const r = await api("/api/admin/knowledge", { method: "POST", body: JSON.stringify({ mode: "seed" }) });
    setBusy(false);
    const j = await r.json();
    if (r.ok) { onFlash(`Loaded ${j.added} curated entries`); load(); } else onFlash(j.error || "Failed");
  }
  async function loadAct() {
    setBusy(true);
    const r = await api("/api/admin/knowledge", { method: "POST", body: JSON.stringify({ mode: "seed-legal-docs" }) });
    setBusy(false);
    const j = await r.json();
    if (r.ok) { onFlash(`Indexed bundled legal docs — ${j.added} chunks`); load(); } else onFlash(j.error || "Failed");
  }
  async function importText() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await api("/api/admin/knowledge", { method: "POST", body: JSON.stringify({ source: src, text }) });
    setBusy(false);
    const j = await r.json();
    if (r.ok) { onFlash(`Imported ${j.added} chunks into ${j.source}`); setText(""); load(); } else onFlash(j.error || "Failed");
  }
  async function del(source: string) {
    const r = await api(`/api/admin/knowledge?source=${encodeURIComponent(source)}`, { method: "DELETE" });
    if (r.ok) { onFlash(`Removed ${source}`); load(); }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">AI knowledge base</h2>
      <p className="mb-3 text-[11px] text-muted">The assistant answers legal questions from this base. Load the curated summaries, and paste the full Electoral Act text for verbatim, section-accurate answers.</p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn-primary text-xs" disabled={busy} onClick={loadAct}>Load bundled legal docs (Act + Regulations 2026)</button>
        <button className="btn-ghost text-xs" disabled={busy} onClick={seed}>Load curated summaries + app guide</button>
      </div>

      {sources.length > 0 && (
        <div className="mb-3 space-y-1">
          {sources.map((s) => (
            <div key={s.source} className="flex items-center justify-between rounded-md border border-line px-2 py-1 text-xs">
              <span><b>{s.source}</b> · {s.chunks} chunk{s.chunks === 1 ? "" : "s"}</span>
              <button className="text-muted hover:text-bad" onClick={() => del(s.source)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <label className="label">Import full document text</label>
      <input className="input mb-2" value={src} onChange={(e) => setSrc(e.target.value)} placeholder="source name e.g. electoral-act-2022-full" />
      <textarea className="input min-h-28" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full Electoral Act 2022 text here (or any reference doc). It's chunked and stored for the assistant." />
      <button className="btn-primary mt-2 w-full" disabled={busy || !text.trim()} onClick={importText}>{busy ? "Importing…" : "Import & index"}</button>
    </section>
  );
}

/* -------- National geography warehouse: harvest INEC polling units -------- */
function WarehouseCard({ onFlash }: { onFlash: (s: string) => void }) {
  const [states, setStates] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ states: number; lgas: number; wards: number; units: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [coverage, setCoverage] = useState<any>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [saved, setSaved] = useState<{ state: string; units: number }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadSaved() {
    const r = await api("/api/admin/geo/rebuild");
    if (r.ok) setSaved((await r.json()).saved || []);
  }

  async function rebuild() {
    if (!window.confirm(`Rebuild the warehouse from ${saved.length} server-side backup(s)? This re-applies every saved state.`)) return;
    setBusy("rebuild");
    const r = await api("/api/admin/geo/rebuild", { method: "POST" });
    const j = await r.json();
    setBusy(null);
    if (r.ok) { setSummary(j.summary); setLog((l) => [`↻ Rebuilt from backups — ${j.result.states} states · ${j.result.units.toLocaleString()} units`, ...l].slice(0, 80)); onFlash(`Rebuilt ${j.result.states} states from backups`); }
    else onFlash(j.error || "Rebuild failed");
  }

  async function checkCoverage() {
    setBusy("coverage");
    const r = await api("/api/admin/geo/validate");
    const j = await r.json();
    setBusy(null);
    if (r.ok) {
      setCoverage(j);
      const s = j.summary;
      const gaps = [
        s.states < s.expectedStates ? `${s.expectedStates - s.states} states missing` : null,
        s.lgas < s.expectedLgas ? `${s.expectedLgas - s.lgas} LGAs short` : null,
        s.emptyWards ? `${s.emptyWards} wards with 0 units` : null,
      ].filter(Boolean).join(" · ");
      onFlash(s.complete ? "Coverage complete — 37 states · 774 LGAs" : `Coverage gaps: ${gaps || "check details"}`);
    } else onFlash(j.error || "Coverage check failed");
  }

  async function load() {
    const r = await api("/api/admin/geo/harvest");
    if (r.ok) { const j = await r.json(); setStates(j.states); setSummary(j.summary); }
  }
  useEffect(() => { load(); loadSaved(); }, []);

  // Import harvested JSON files (from scripts/harvest-inec.mjs) — the server can't
  // reach INEC, so we upload the files harvested on a laptop.
  async function importFiles(files: FileList | null) {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) {
      try {
        const json = JSON.parse(await f.text());
        // A combined file has { states:[{state,units},…] }; a single file is { state, units }.
        const parts: { state: string; units: any[] }[] = Array.isArray(json.states) ? json.states : [{ state: json.state, units: json.units }];
        for (const p of parts) {
          setBusy(p.state || f.name);
          const r = await api("/api/admin/geo/import", { method: "POST", body: JSON.stringify({ state: p.state, units: p.units, replace: replaceMode }) });
          const j = await r.json();
          if (r.ok) {
            setLog((l) => [`✓ ${j.result.state}: ${j.result.lgas} LGAs · ${j.result.wards} wards · ${j.result.units} units imported (${(j.result.ms / 1000).toFixed(0)}s)`, ...l].slice(0, 80));
            setSummary(j.summary);
            onFlash(`${j.result.state} imported — ${j.result.units} units`);
          } else {
            setLog((l) => [`✗ ${p.state || f.name}: ${j.error || "failed"}`, ...l].slice(0, 80));
          }
        }
      } catch (e: any) {
        setLog((l) => [`✗ ${f.name}: ${e?.message || "parse error"}`, ...l].slice(0, 80));
      }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    loadSaved();
  }

  async function harvest(state: string) {
    setBusy(state);
    const r = await api("/api/admin/geo/harvest", { method: "POST", body: JSON.stringify({ state }) });
    const j = await r.json();
    setBusy(null);
    if (r.ok) {
      const res = j.result;
      setLog((l) => [`✓ ${state}: ${res.lgas} LGAs · ${res.wards} wards · ${res.units} units (${(res.ms / 1000).toFixed(0)}s)`, ...l].slice(0, 40));
      setSummary(j.summary);
      onFlash(`${state} warehoused — ${res.units} units`);
    } else {
      setLog((l) => [`✗ ${state}: ${j.error || "failed"}`, ...l].slice(0, 40));
      onFlash(j.error || "Harvest failed");
    }
    return r.ok;
  }

  async function harvestAll() {
    for (const s of states) {
      // eslint-disable-next-line no-await-in-loop
      await harvest(s);
    }
    onFlash("National harvest complete");
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Polling-unit warehouse</h2>
      <p className="mb-3 text-[11px] text-muted">Nigeria&apos;s full LGA → Ward → Polling-Unit register so every election can pick real units. Idempotent — re-importing a state just updates it. INEC blocks non-browser clients, so harvest by pasting <span className="tabular">scripts/harvest-inec-browser.js</span> into your browser console on inecnigeria.org, then upload the downloaded files below.</p>

      <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">Import harvested files</div>
        <p className="mt-1 text-[11px] text-muted">Select the combined <span className="tabular">NIGERIA-INEC-all.json</span> (all states) or one/more <span className="tabular">&lt;STATE&gt;.json</span> files from the browser harvester.</p>
        <input ref={fileRef} type="file" accept=".json,application/json" multiple disabled={!!busy}
          onChange={(e) => importFiles(e.target.files)}
          className="mt-2 block w-full text-[11px] file:mr-2 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" />
        <label className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <input type="checkbox" checked={replaceMode} onChange={(e) => setReplaceMode(e.target.checked)} />
          Full refresh — replace each state&apos;s existing data (use when re-harvesting after INEC updates). Off = add only new units.
        </label>
        {busy && <div className="mt-2 text-[11px] text-muted">Importing {busy}…</div>}
      </div>

      {summary && (
        <div className="mb-3 grid grid-cols-4 gap-2 text-center">
          {[["States", summary.states], ["LGAs", summary.lgas], ["Wards", summary.wards], ["Units", summary.units]].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border border-line py-2">
              <div className="text-sm font-bold tabular">{(v as number).toLocaleString()}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted">{k}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <button className="btn-primary text-xs" disabled={!!busy} onClick={harvestAll}>
          {busy ? `Working ${busy}…` : "Harvest all 37 states"}
        </button>
        <button className="btn-ghost text-xs" disabled={!!busy} onClick={checkCoverage}>Check coverage (37 / 774)</button>
        {saved.length > 0 && <button className="btn-ghost text-xs" disabled={!!busy} onClick={rebuild}>Rebuild from saved ({saved.length})</button>}
      </div>
      {saved.length > 0 && (
        <p className="mb-3 text-[11px] text-muted">💾 {saved.length} state{saved.length === 1 ? "" : "s"} backed up on the server ({saved.reduce((n, s) => n + s.units, 0).toLocaleString()} units) — you can rebuild the warehouse from these without re-uploading files.</p>
      )}

      {coverage && (
        <div className="mb-3 rounded-lg border border-line bg-surface p-3 text-[11px]">
          <div className="mb-2 font-semibold">
            Coverage: {coverage.summary.states}/37 states · {coverage.summary.lgas}/{coverage.summary.expectedLgas} LGAs · {coverage.summary.units.toLocaleString()} units
            {coverage.summary.emptyWards > 0 && <span className="text-warn"> · {coverage.summary.emptyWards} wards with no units</span>}
            {coverage.summary.complete && <span className="text-good"> · ✓ complete</span>}
          </div>
          {coverage.summary.missingStates?.length > 0 && (
            <div className="mb-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 text-warn">
              <b>Not imported yet ({coverage.summary.missingStates.length}):</b> {coverage.summary.missingStates.join(", ")}
            </div>
          )}
          {coverage.summary.shortStates?.length > 0 && (
            <div className="mb-2 text-warn">
              <b>Short on LGAs:</b> {coverage.summary.shortStates.map((x: any) => `${x.state} (${x.have}/${x.expected})`).join(", ")}
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
            {coverage.states.map((s: any) => (
              <div key={s.state} className={`flex justify-between tabular ${s.complete ? "text-muted" : "text-warn"}`}>
                <span className="truncate">{s.complete ? "" : "⚠ "}{s.state}</span>
                <span>{s.lgas}/{s.expectedLgas ?? "?"} · {s.units}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-1">
        {states.map((s) => (
          <button key={s} disabled={!!busy}
            className="rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent disabled:opacity-40"
            onClick={() => harvest(s)}>
            {busy === s ? "…" : s}
          </button>
        ))}
      </div>

      {log.length > 0 && (
        <div className="max-h-40 space-y-0.5 overflow-auto rounded-md border border-line bg-surface p-2 text-[11px] tabular">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </section>
  );
}

/* -------- Billing: seat calculator + Paystack / Squad checkout -------- */
type SeatStatus = { freeSeats: number; paidSeats: number; total: number; used: number; available: number; priceNaira: number; providers: { paystack: boolean; squad: boolean } };

function BillingCard({ onFlash }: { onFlash: (s: string) => void }) {
  const [st, setSt] = useState<SeatStatus | null>(null);
  const [units, setUnits] = useState("");
  const [perUnit, setPerUnit] = useState("1");
  const [buy, setBuy] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() { const r = await api("/api/billing/status"); if (r.ok) setSt(await r.json()); }
  useEffect(() => { load(); }, []);

  async function reconcile() {
    setBusy(true);
    const r = await api("/api/billing/reconcile", { method: "POST" });
    setBusy(false);
    const j = await r.json();
    if (r.ok) { onFlash(j.credited ? `Confirmed ${j.credited} payment(s)` : "No new payments"); load(); } else onFlash(j.error || "Failed");
  }

  const PRICE = st?.priceNaira ?? 1000;
  const free = st?.freeSeats ?? 10;
  const seats = (Number(units) || 0) * (Number(perUnit) || 0);
  const billable = Math.max(0, seats - free);
  const planCost = billable * PRICE;
  const shortfall = st ? Math.max(0, seats - st.total) : 0;

  async function checkout(provider: "PAYSTACK" | "SQUAD") {
    const n = Math.max(1, Math.round(Number(buy) || shortfall || billable));
    if (!email.trim()) { onFlash("Enter a billing email."); return; }
    setBusy(true);
    const r = await api("/api/billing/checkout", { method: "POST", body: JSON.stringify({ provider, seats: n, email }) });
    setBusy(false);
    const j = await r.json();
    if (r.ok && j.url) { window.location.href = j.url; }
    else onFlash(j.error || "Checkout failed");
  }

  return (
    <section className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted">Seats &amp; billing</h2>
        <button className="text-xs text-accent hover:underline" disabled={busy} onClick={reconcile}>Check payments</button>
      </div>
      <p className="mb-3 text-[11px] text-muted">A seat = one agent code. First {free} are free to trial; extra seats are ₦{PRICE.toLocaleString()} each, one-off for this election.</p>

      {st && (
        <div className="mb-4 grid grid-cols-4 gap-2 text-center">
          <div className="rounded-lg border border-line p-2"><div className="tabular text-lg font-bold">{st.used}</div><div className="text-[10px] uppercase text-muted">Used</div></div>
          <div className="rounded-lg border border-line p-2"><div className="tabular text-lg font-bold text-good">{st.available}</div><div className="text-[10px] uppercase text-muted">Available</div></div>
          <div className="rounded-lg border border-line p-2"><div className="tabular text-lg font-bold">{st.freeSeats}</div><div className="text-[10px] uppercase text-muted">Free</div></div>
          <div className="rounded-lg border border-line p-2"><div className="tabular text-lg font-bold">{st.paidSeats}</div><div className="text-[10px] uppercase text-muted">Paid</div></div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Calculator */}
        <div>
          <label className="label">Plan calculator</label>
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-[11px] text-muted">Units to cover</span><input className="input tabular" inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 200" /></div>
            <div><span className="text-[11px] text-muted">Agents / unit</span><input className="input tabular" inputMode="numeric" value={perUnit} onChange={(e) => setPerUnit(e.target.value.replace(/[^0-9]/g, ""))} placeholder="1" /></div>
          </div>
          <div className="mt-3 rounded-lg border border-line bg-white/[0.03] p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted">Total agents (seats)</span><b className="tabular">{seats.toLocaleString()}</b></div>
            <div className="flex justify-between"><span className="text-muted">Free</span><span className="tabular">-{Math.min(seats, free)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Billable seats</span><b className="tabular">{billable.toLocaleString()}</b></div>
            <div className="mt-1 flex justify-between border-t border-line pt-1 text-base"><span className="font-semibold">One-off cost</span><b className="tabular text-accent">₦{planCost.toLocaleString()}</b></div>
          </div>
        </div>

        {/* Checkout */}
        <div>
          <label className="label">Buy seats</label>
          <input className="input mb-2 tabular" inputMode="numeric" value={buy} onChange={(e) => setBuy(e.target.value.replace(/[^0-9]/g, ""))} placeholder={`Seats to buy${shortfall ? ` (need ${shortfall} more)` : ""}`} />
          <input className="input mb-2" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="Billing email (receipt)" />
          <div className="text-[11px] text-muted">Amount: <b className="tabular text-ink">₦{((Math.max(1, Number(buy) || shortfall || billable)) * PRICE).toLocaleString()}</b></div>
          <div className="mt-2 flex gap-2">
            <button className="btn-primary flex-1" disabled={busy || !st?.providers.paystack} onClick={() => checkout("PAYSTACK")} title={st?.providers.paystack ? "" : "Set PAYSTACK_SECRET_KEY"}>Pay with Paystack</button>
            <button className="btn-ghost flex-1" disabled={busy || !st?.providers.squad} onClick={() => checkout("SQUAD")} title={st?.providers.squad ? "" : "Set SQUAD_SECRET_KEY"}>Pay with Squad</button>
          </div>
          {st && !st.providers.paystack && !st.providers.squad && <p className="mt-2 text-[11px] text-warn">No payment provider configured yet (set PAYSTACK_SECRET_KEY and/or SQUAD_SECRET_KEY).</p>}
        </div>
      </div>
    </section>
  );
}

/* -------- White-label branding editor -------- */
function BrandingCard({ onFlash }: { onFlash: (s: string) => void }) {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [accent, setAccent] = useState("#5b8cff");
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api("/api/admin/branding");
    if (r.ok) { const b = await r.json(); setName(b.name || ""); setTagline(b.tagline || ""); setAccent(b.accent || "#5b8cff"); setLogoUrl(b.logoUrl || ""); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true);
    const r = await api("/api/admin/branding", { method: "PATCH", body: JSON.stringify({ name, tagline, accent, logoUrl }) });
    setBusy(false);
    if (r.ok) { onFlash("Branding saved — reloading to apply"); setTimeout(() => location.reload(), 700); }
    else onFlash("Failed");
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">White-label branding</h2>
      <p className="mb-3 text-[11px] text-muted">Reskin this deployment — the name, tagline, accent colour and logo apply across the landing page, room, agent app and titles.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div><label className="label">Brand name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Situation Room" /></div>
        <div><label className="label">Tagline</label><input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Real-time election monitoring" /></div>
        <div>
          <label className="label">Accent colour</label>
          <div className="flex items-center gap-2">
            <input type="color" className="h-10 w-12 cursor-pointer rounded border border-line bg-surface" value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#5b8cff"} onChange={(e) => setAccent(e.target.value)} />
            <input className="input tabular" value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="#5b8cff" />
          </div>
        </div>
        <div><label className="label">Logo URL (optional)</label><input className="input" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" /></div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save branding"}</button>
        {logoUrl && <img src={logoUrl} alt="preview" className="h-9 w-9 rounded object-contain ring-1 ring-line" />}
        <span className="rounded px-2 py-1 text-xs font-semibold text-white" style={{ background: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#5b8cff" }}>Accent preview</span>
      </div>
    </section>
  );
}
