"use client";
import { useEffect, useMemo, useState } from "react";
import { api, logout } from "@/lib/session";
import RoomLogin from "@/components/RoomLogin";
import QrModal from "@/components/QrModal";
import ThemeToggle from "@/components/ThemeToggle";
import type { Session } from "@/lib/auth";

type Unit = { id: string; name: string; code: string; ward: string; lga: string; label: string; agents: number };
type Lga = { id: string; name: string };
type Agent = { id: string; name: string; phone?: string; email?: string | null; inviteCode: string; status: string; unitLabel: string; usedAt?: string | null; lastSeenAt?: string | null };

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
  const [bulkLga, setBulkLga] = useState("");
  const [bulkResult, setBulkResult] = useState<{ name: string; inviteCode: string; unitLabel: string }[] | null>(null);
  const [qr, setQr] = useState<{ code: string; label?: string } | null>(null);

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
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a href="/room" className="btn-ghost">Dashboard</a>
        </div>
      </header>

      {flash && <div className="mx-5 mt-4 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm">{flash}</div>}

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
                <button key={r.inviteCode} className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-ink/5"
                  onClick={() => setQr({ code: r.inviteCode, label: r.unitLabel })} title="Show QR / copy">
                  <span className="truncate text-muted">{r.unitLabel}</span>
                  <span className="tabular shrink-0 font-semibold text-accent">{r.inviteCode}</span>
                </button>
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
                    {a.email && <div className="truncate text-[11px] text-accent">🔑 {a.email}</div>}
                  </div>
                  <span className={`pill ${a.status === "ACTIVE" ? "bg-good/15 text-good" : a.status === "SUSPENDED" ? "bg-bad/15 text-bad" : "bg-ink/5 text-muted"}`}>{a.status}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <button className="tabular rounded-md bg-ink/5 px-2 py-1 text-sm font-semibold text-accent hover:bg-accent/15" onClick={() => setQr({ code: a.inviteCode, label: `${a.name} · ${a.unitLabel}` })} title="Show QR / copy">{a.inviteCode} ⧉</button>
                  <button className="text-xs text-muted hover:text-ink" onClick={() => reset(a.id)}>Reset code</button>
                </div>
              </div>
            ))}
            {!agents.length && <p className="text-sm text-muted">No agents yet.</p>}
          </div>
        </section>
      </main>

      <div className="space-y-4 p-5 pt-0">
        <TallyOverride units={units} onFlash={setFlash} />
        {session.role === "ADMIN" && <StaffUsers onFlash={setFlash} />}
      </div>

      {qr && <QrModal code={qr.code} label={qr.label} onClose={() => setQr(null)} onCopy={copyText} />}
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
