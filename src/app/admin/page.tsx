"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, logout } from "@/lib/session";
import RoomLogin from "@/components/RoomLogin";
import QrModal from "@/components/QrModal";
import { confirmDialog, alertDialog, promptDialog } from "@/components/Dialog";
import SearchSelect from "@/components/SearchSelect";
import ThemeToggle from "@/components/ThemeToggle";
import AiChat from "@/components/AiChat";
import GeoSearch from "@/components/GeoSearch";
import RootTenantGate from "@/components/RootTenantGate";
import type { Session } from "@/lib/auth";

// Safely turn any API error payload (string, or a zod flatten object) into text.
function errText(j: any): string {
  if (!j) return "";
  if (typeof j.error === "string") return j.error;
  const fe = j.error?.formErrors;
  if (Array.isArray(fe) && fe.length) return fe.join(", ");
  if (typeof j.error === "object") { try { return JSON.stringify(j.error); } catch { return "Invalid request."; } }
  return "";
}

type Unit = { id: string; name: string; code: string; ward: string; lga: string; label: string; agents: number };
type Lga = { id: string; name: string };
type Agent = { id: string; name: string; phone?: string | null; email?: string | null; inviteCode: string; status: string; unitLabel: string; unit?: string | null; lga?: string | null; state?: string | null; lgaId?: string | null; usedAt?: string | null; lastSeenAt?: string | null };

export default function AdminPage() {
  const [state, setState] = useState<"loading" | "in" | "out" | "denied">("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [isSuper, setIsSuper] = useState(false);

  async function check() {
    const r = await api("/api/auth/me");
    if (!r.ok) return setState("out");
    const j = await r.json();
    const role = j.session?.role;
    setSession(j.session);
    setIsSuper(!!j.isSuper);
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
  // The bare /admin root is reserved for super-admins. A tenant admin who lands
  // here is redirected to their own room (or picks, if they own several).
  const bareRoot = typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === "/admin";
  if (bareRoot) return <RootTenantGate base="admin"><Console session={session!} isSuper={isSuper} /></RootTenantGate>;
  return <Console session={session!} isSuper={isSuper} />;
}

type AdminTab = "codes" | "geo" | "results" | "ai" | "billing" | "settings" | "tenants";

function Console({ session, isSuper }: { session: Session; isSuper: boolean }) {
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
  const [bulkWard, setBulkWard] = useState("");
  const [bulkUnit, setBulkUnit] = useState("");
  const [bulkWards, setBulkWards] = useState<{ id: string; label: string; units: number }[]>([]);
  const [bulkUnits, setBulkUnits] = useState<{ id: string; label: string }[]>([]);
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

  // Polling-unit picker searches ALL units in the election's state server-side
  // as the admin types (debounced). We optimistically show matches from the
  // already-loaded set first, then replace them with the fuller server results.
  const [unitResults, setUnitResults] = useState<Unit[]>([]);
  const [unitSearching, setUnitSearching] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setUnitResults([]); setUnitSearching(false); return; }
    setUnitSearching(true);
    const h = setTimeout(async () => {
      const r = await api(`/api/admin/units?q=${encodeURIComponent(term)}`);
      if (r.ok) setUnitResults((await r.json()).units || []);
      setUnitSearching(false);
    }, 250);
    return () => clearTimeout(h);
  }, [q]);
  const displayUnits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    if (unitResults.length) return unitResults;
    return units.filter((u) => u.label.toLowerCase().includes(s)).slice(0, 50); // optimistic
  }, [q, unitResults, units]);

  async function createAgent() {
    if (!name.trim() || !unitId) return;
    setBusy(true);
    try {
      const r = await api("/api/admin/agents", { method: "POST", body: JSON.stringify({ name, phone, email: agentEmail, pollingUnitId: unitId }) });
      const j = await r.json().catch(() => ({} as any));
      if (r.ok && j.agent) {
        setName(""); setPhone(""); setAgentEmail(""); setUnitId(""); setQ("");
        load();
        await alertDialog({ title: "Code created", body: `${j.agent.name}\nCode: ${j.agent.inviteCode}\n${j.agent.unitLabel || ""}` });
      } else {
        await alertDialog({ title: "Couldn’t create code", body: errText(j) || `Request failed (HTTP ${r.status}).` });
      }
    } catch {
      await alertDialog({ title: "Network error", body: "Couldn’t reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  // Drill-down: when LGA changes load its wards (reset deeper); when ward changes
  // load its units (reset deeper).
  useEffect(() => {
    setBulkWard(""); setBulkUnit(""); setBulkWards([]); setBulkUnits([]);
    if (!bulkLga) return;
    api(`/api/admin/geo?lgaId=${bulkLga}`).then(async (r) => {
      if (r.ok) setBulkWards(((await r.json()).wards || []).map((w: any) => ({ id: w.id, label: w.name, units: w.units || 0 })));
    });
  }, [bulkLga]);
  useEffect(() => {
    setBulkUnit(""); setBulkUnits([]);
    if (!bulkWard) return;
    api(`/api/admin/geo?wardId=${bulkWard}`).then(async (r) => {
      if (r.ok) setBulkUnits(((await r.json()).units || []).map((u: any) => ({ id: u.id, label: u.name })));
    });
  }, [bulkWard]);

  async function bulk() {
    if (!bulkLga && !bulkWard && !bulkUnit) return;
    setBusy(true); setBulkResult(null);
    // Deepest selection wins: unit → ward → LGA.
    const body = { perUnit: Number(perUnit) || 1, ...(bulkUnit ? { unitId: bulkUnit } : bulkWard ? { wardId: bulkWard } : { lgaId: bulkLga }) };
    try {
      const r = await api("/api/admin/agents/bulk", { method: "POST", body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({} as any));
      if (r.ok) {
        setBulkResult(j.created); load();
        await alertDialog({ title: "Codes generated", body: `Created ${j.count} code${j.count === 1 ? "" : "s"}.${j.capped ? " (capped by your seat limit — buy more seats to add the rest.)" : ""}` });
      } else {
        await alertDialog({ title: "Couldn’t generate codes", body: errText(j) || `Request failed (HTTP ${r.status}).` });
      }
    } catch {
      await alertDialog({ title: "Network error", body: "Couldn’t reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function reset(id: string) {
    const r = await api(`/api/admin/agents/${id}/reset`, { method: "POST" });
    if (r.ok) { const j = await r.json(); setFlash(`New code: ${j.inviteCode}`); load(); }
  }

  async function delAgent(a: Agent) {
    const ok = await confirmDialog({
      title: "Delete this code?",
      body: `${a.name}\n${a.inviteCode} · ${a.unitLabel}\n\nThis permanently removes the code. Any reports already sent are kept but unlinked.`,
      confirmText: "Delete", danger: true,
    });
    if (!ok) return;
    try {
      const r = await api(`/api/admin/agents/${a.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({} as any));
      if (r.ok) { load(); setFlash(`Deleted ${a.inviteCode}`); }
      else await alertDialog({ title: "Couldn’t delete", body: errText(j) || `Request failed (HTTP ${r.status}).` });
    } catch {
      await alertDialog({ title: "Network error", body: "Couldn’t reach the server. Try again." });
    }
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
      // Search by name, code, unit/ward/LGA/state (via label), LGA, state, phone, email.
      return [a.name, a.inviteCode, a.unitLabel, a.lga || "", a.state || "", a.phone || "", a.email || ""]
        .some((x) => x.toLowerCase().includes(s));
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
  // The bare /admin is the platform super-console (no tenant scoped); a tenant
  // admin lives at /{slug}/admin. Only show a specific election name for the latter.
  const superConsole = typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === "/admin";
  const [electionName, setElectionName] = useState("");
  useEffect(() => {
    if (superConsole) return;
    api("/api/bootstrap").then((r) => (r.ok ? r.json() : null)).then((j) => j?.election?.name && setElectionName(j.election.name)).catch(() => {});
  }, [superConsole]);
  const headerTitle = superConsole ? "Super admin console" : (electionName || "Situation Room");
  const TABS: { key: AdminTab; label: string }[] = [
    { key: "codes", label: "Agents & Codes" },
    // Geography + Tenants = platform-wide, super-admins only.
    ...(isSuper ? [{ key: "geo" as const, label: "Geography" }, { key: "tenants" as const, label: "Tenants" }] : []),
    { key: "results", label: "Results" },
    // AI & Knowledge temporarily hidden from tenant admins (super-admins keep it
    // for testing) until the analysis feature is finalized.
    ...(isSuper ? [{ key: "ai" as const, label: "AI & Knowledge" }] : []),
    ...(isAdmin ? [{ key: "billing" as const, label: "Billing" }, { key: "settings" as const, label: "Settings" }] : []),
  ];
  const tabTitle: Record<AdminTab, string> = {
    codes: "Agents & access codes", geo: "Geography warehouse", results: "Results & tally",
    ai: "AI & knowledge base", billing: "Seats & billing", settings: "Branding & staff", tenants: "All tenants",
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface/80 px-3 py-3 backdrop-blur-md sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/psr-logo.png" alt="PSR" className="h-7 w-auto max-w-[100px] shrink-0 object-contain" />
          {/* Verbose title only on ≥sm; on mobile the top bar stays clean (logo + actions). */}
          <div className="hidden min-w-0 border-l border-line pl-3 sm:block">
            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Admin · {tabTitle[tab]}</div>
            <div className="truncate text-lg font-bold tracking-tight" title={headerTitle}>{headerTitle}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <a href="/room" className="btn-ghost px-3 py-1.5 text-sm">Dashboard</a>
        </div>
      </header>
      {/* Compact election name on mobile, below the top bar. */}
      <div className="border-b border-line px-4 py-2 sm:hidden">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Admin · {tabTitle[tab]}</div>
        <div className="truncate text-base font-bold tracking-tight">{headerTitle}</div>
      </div>

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
              <input className="input mb-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any unit / ward / LGA in the state…" />
              {q.trim().length >= 2 && (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
                  {displayUnits.map((u) => (
                    <button type="button" key={u.id} onClick={() => setUnitId(u.id)}
                      className={`flex w-full items-center justify-between gap-2 border-b border-line/60 px-3 py-2 text-left text-sm last:border-0 ${unitId === u.id ? "bg-accent/15 font-semibold text-ink" : "text-muted hover:bg-ink/5"}`}>
                      <span className="truncate">{u.label}</span>
                      {u.agents ? <span className="pill shrink-0 bg-ink/10 text-muted">{u.agents}</span> : null}
                    </button>
                  ))}
                  {!displayUnits.length && <div className="px-3 py-3 text-sm text-muted">{unitSearching ? "Searching…" : "No matching units."}</div>}
                </div>
              )}
              {q.trim().length < 2 && <p className="text-[11px] text-muted">Type at least 2 characters to search all polling units in the state.</p>}
            </div>
            <button className="btn-primary w-full" disabled={busy || !name.trim() || !unitId} onClick={createAgent}>Generate access code</button>
          </div>
        </section>

        {/* Bulk generate — drill down LGA → Ward → Unit. Super-admins only:
            tenant admins register known agents individually. */}
        {isSuper && (
        <section className="card p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Bulk: generate codes by area</h2>
          <div className="space-y-2">
            <div>
              <label className="label">LGA</label>
              <SearchSelect value={bulkLga} onChange={setBulkLga} options={lgas.map((l) => ({ id: l.id, label: l.name }))} placeholder="Select LGA…" />
            </div>
            <div>
              <label className="label">Ward <span className="text-muted">(optional)</span></label>
              <SearchSelect value={bulkWard} onChange={setBulkWard} options={bulkWards} placeholder={bulkLga ? "All wards in LGA" : "Pick an LGA first"} disabled={!bulkLga} />
            </div>
            <div>
              <label className="label">Unit <span className="text-muted">(optional)</span></label>
              <SearchSelect value={bulkUnit} onChange={setBulkUnit} options={bulkUnits} placeholder={bulkWard ? "All units in ward" : "Pick a ward first"} disabled={!bulkWard} />
            </div>
          </div>
          <div className="mt-2 flex items-end gap-2">
            <div className="w-28">
              <label className="label">Codes / unit</label>
              <input className="input tabular" type="number" min={1} max={10} value={perUnit} onChange={(e) => setPerUnit(e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
            <button className="btn-primary flex-1" disabled={busy || (!bulkLga && !bulkWard && !bulkUnit)} onClick={bulk}>{busy ? "Generating…" : "Generate"}</button>
          </div>
          {(() => {
            const n = Number(perUnit) || 1;
            if (!bulkLga) return <p className="mt-2 text-[11px] text-muted">Pick an LGA. Add a ward or a specific unit to narrow it down — codes are only minted for the level you choose.</p>;
            const unitsN = bulkUnit ? 1 : bulkWard ? (bulkWards.find((w) => w.id === bulkWard)?.units || bulkUnits.length || 0)
              : bulkWards.reduce((s, w) => s + w.units, 0);
            const where = bulkUnit ? "this unit" : bulkWard ? "this ward" : "this LGA";
            return <p className="mt-2 text-[11px] text-muted">Will mint <b>{unitsN ? n * unitsN : n}</b> fresh code{n * unitsN === 1 ? "" : "s"} — {n} per unit across <b>{unitsN || "?"}</b> unit{unitsN === 1 ? "" : "s"} in {where}. Re-run to top up (existing codes kept).</p>;
          })()}

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
        )}

        {/* Agent management. When the super-only bulk panel is hidden this takes
            the freed column so tenant admins get a roomier list. */}
        <section className={`card p-5 ${isSuper ? "" : "lg:col-span-2"}`}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted">Agent management ({filteredAgents.length}/{agents.length})</h2>
            <button className="text-xs text-accent hover:underline" onClick={exportCsv}>Export CSV</button>
          </div>
          <input className="input mb-2" value={agentQ} onChange={(e) => setAgentQ(e.target.value)} placeholder="Search name, phone, email, unit, LGA or state…" />
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
                      <button className="text-bad hover:brightness-125" onClick={() => delAgent(a)}>Delete</button>
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

      {tab === "tenants" && isSuper && <TenantsPanel />}

      {tab === "geo" && isSuper && (
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

      {tab === "ai" && isSuper && (
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
          <BallotCard onFlash={setFlash} />
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

/* -------- Geography tree: State → LGA → Ward → Unit -------- */
type GState = { id: string; name: string; code: string; lgas: number; wards: number; units: number; codes: number };
type GLga = { id: string; name: string; wards: number; units: number; codes: number };
type GWard = { id: string; name: string; code: string; units: number; codes: number };
type GUnit = { id: string; name: string; code: string; codes: number; used: number; active: number; reports: number };
type GUnitDetail = {
  unit: { id: string; name: string; label: string; ward: string; lga: string; registeredVoters: number };
  codes: { id: string; name: string; inviteCode: string; status: string; email?: string | null; phone?: string | null; usedAt?: string | null; lastSeenAt?: string | null }[];
  submissions: { id: string; type: string; text?: string; severity?: string; confidence?: string; scoreStatus?: string; receivedAt: string; scores: { party: string; color: string; votes: number }[]; media: { url: string; thumbUrl?: string; mime: string; kind: string }[] }[];
};

function GeoConsole({ onFlash, onOpenAgent }: { onFlash: (s: string) => void; onOpenAgent: (id: string) => void }) {
  const [states, setStates] = useState<GState[]>([]);
  const [lgasBy, setLgasBy] = useState<Record<string, GLga[]>>({});
  const [wardsBy, setWardsBy] = useState<Record<string, GWard[]>>({});
  const [unitsBy, setUnitsBy] = useState<Record<string, GUnit[]>>({});
  const [openS, setOpenS] = useState<Record<string, boolean>>({});
  const [openL, setOpenL] = useState<Record<string, boolean>>({});
  const [openW, setOpenW] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<GUnitDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState({ state: "", lga: "", ward: "", pu: "" });

  async function loadStates() { const r = await api("/api/admin/geo"); if (r.ok) setStates((await r.json()).states); }
  useEffect(() => { loadStates(); }, []);

  async function toggleState(s: GState) {
    setOpenS((o) => ({ ...o, [s.id]: !o[s.id] }));
    if (!lgasBy[s.id]) { const r = await api(`/api/admin/geo?stateId=${s.id}`); if (r.ok) { const j = await r.json(); setLgasBy((m) => ({ ...m, [s.id]: j.lgas })); } }
  }
  async function toggleLga(l: GLga) {
    setOpenL((o) => ({ ...o, [l.id]: !o[l.id] }));
    if (!wardsBy[l.id]) { const r = await api(`/api/admin/geo?lgaId=${l.id}`); if (r.ok) { const j = await r.json(); setWardsBy((m) => ({ ...m, [l.id]: j.wards })); } }
  }
  async function toggleWard(w: GWard) {
    setOpenW((o) => ({ ...o, [w.id]: !o[w.id] }));
    if (!unitsBy[w.id]) { const r = await api(`/api/admin/geo?wardId=${w.id}`); if (r.ok) { const j = await r.json(); setUnitsBy((m) => ({ ...m, [w.id]: j.units })); } }
  }
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

  async function submitAdd() {
    if (!add.state.trim()) return;
    setBusy(true);
    const r = await api("/api/admin/geo", { method: "POST", body: JSON.stringify(add) });
    const j = await r.json();
    setBusy(false);
    if (r.ok) {
      onFlash(`Added: ${Object.values(j.created).join(" / ")}`);
      setAdd({ state: add.state, lga: "", ward: "", pu: "" });
      // Refresh: clear caches so re-expanding refetches, and update counts.
      setLgasBy({}); setWardsBy({}); setUnitsBy({}); loadStates();
    } else onFlash(typeof j.error === "string" ? j.error : "Add failed");
  }

  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString() : "");
  const typeColor: Record<string, string> = { INCIDENT: "bg-bad/10 text-bad", SCORE: "bg-accent/10 text-accent", MESSAGE: "bg-ink/10 text-ink", STATUS: "bg-ink/10 text-muted" };
  const chevron = (open: boolean) => <span className="inline-block w-3 text-muted">{open ? "▾" : "▸"}</span>;

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
          {detail ? <button className="text-accent hover:underline" onClick={() => setDetail(null)}>← Back to geography tree</button> : "Geography — State › LGA › Ward › Unit"}
        </h2>
        {!detail && <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "Close" : "+ Add manually"}</button>}
      </div>

      {!detail && (
        <div className="mb-3">
          <GeoSearch placeholder="Jump to a polling unit, ward or LGA…" onPick={(h) => { if (h.type === "unit") openUnit({ id: h.id } as any); else onFlash(`${h.type.toUpperCase()}: ${[h.state, h.lga, h.name].filter(Boolean).join(" › ")}`); }} />
        </div>
      )}

      {!detail && showAdd && (
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
          <p className="mb-2 text-[11px] text-muted">Add a missing branch (for INEC gaps that can&apos;t be harvested). Fill what you need — State only, or down to a Polling Unit. Existing names are reused, not duplicated.</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <input className="input py-1.5 text-sm" value={add.state} onChange={(e) => setAdd({ ...add, state: e.target.value })} placeholder="State e.g. BORNO" />
            <input className="input py-1.5 text-sm" value={add.lga} onChange={(e) => setAdd({ ...add, lga: e.target.value })} placeholder="LGA (optional)" />
            <input className="input py-1.5 text-sm" value={add.ward} onChange={(e) => setAdd({ ...add, ward: e.target.value })} placeholder="Ward (optional)" />
            <input className="input py-1.5 text-sm" value={add.pu} onChange={(e) => setAdd({ ...add, pu: e.target.value })} placeholder="Polling unit (optional)" />
          </div>
          <button className="btn-primary mt-2 px-3 py-1.5 text-xs" disabled={busy || !add.state.trim()} onClick={submitAdd}>{busy ? "Adding…" : "Add branch"}</button>
        </div>
      )}

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
      ) : (
        <div className="space-y-1">
          {states.map((s) => (
            <div key={s.id} className="rounded-lg border border-line">
              <button onClick={() => toggleState(s)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-ink/5">
                <span className="font-semibold">{chevron(!!openS[s.id])} {s.name}</span>
                <span className="shrink-0 text-[11px] text-muted">{s.lgas} LGAs · {s.wards} wards · {s.units.toLocaleString()} units</span>
              </button>
              {openS[s.id] && (
                <div className="ml-5 border-l-2 border-line/60 border-t pl-3">
                  {(lgasBy[s.id] || []).map((l) => (
                    <div key={l.id}>
                      <button onClick={() => toggleLga(l)} className="flex w-full items-center justify-between gap-2 py-1.5 pr-3 text-left text-sm hover:bg-ink/5">
                        <span>{chevron(!!openL[l.id])} {l.name}</span>
                        <span className="shrink-0 text-[11px] text-muted">{l.wards} wards · {l.units} units</span>
                      </button>
                      {openL[l.id] && (
                        <div className="ml-5 border-l-2 border-line/40 pl-3">
                          {(wardsBy[l.id] || []).map((w) => (
                            <div key={w.id}>
                              <button onClick={() => toggleWard(w)} className="flex w-full items-center justify-between gap-2 py-1.5 pr-3 text-left text-sm hover:bg-ink/5">
                                <span>{chevron(!!openW[w.id])} {w.name}</span>
                                <span className="shrink-0 text-[11px] text-muted">{w.units} units{w.codes ? ` · ${w.codes} codes` : ""}</span>
                              </button>
                              {openW[w.id] && (
                                <div className="ml-5 grid gap-1 border-l-2 border-line/30 py-1 pl-3 sm:grid-cols-2">
                                  {(unitsBy[w.id] || []).map((u) => (
                                    <button key={u.id} onClick={() => openUnit(u)} className="flex items-center justify-between gap-2 rounded-md border border-line/60 px-2 py-1 text-left text-[13px] hover:border-accent/40 hover:bg-ink/5">
                                      <span className="truncate">{u.name}</span>
                                      <span className="shrink-0 text-[10px] text-muted">{u.codes ? `${u.codes} code${u.codes === 1 ? "" : "s"}` : "—"}</span>
                                    </button>
                                  ))}
                                  {!unitsBy[w.id] && <span className="text-[11px] text-muted">Loading…</span>}
                                  {unitsBy[w.id] && !unitsBy[w.id].length && <span className="text-[11px] text-muted">No units.</span>}
                                </div>
                              )}
                            </div>
                          ))}
                          {!wardsBy[l.id] && <div className="py-1 text-[11px] text-muted">Loading…</div>}
                          {wardsBy[l.id] && !wardsBy[l.id].length && <div className="py-1 text-[11px] text-muted">No wards.</div>}
                        </div>
                      )}
                    </div>
                  ))}
                  {!lgasBy[s.id] && <div className="py-1.5 text-[11px] text-muted">Loading…</div>}
                  {lgasBy[s.id] && !lgasBy[s.id].length && <div className="py-1.5 text-[11px] text-muted">No LGAs.</div>}
                </div>
              )}
            </div>
          ))}
          {!states.length && <p className="text-xs text-muted">No geography yet — import harvested files above.</p>}
        </div>
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
              <button className="btn-ghost text-xs" onClick={() => onCopy(`${window.location.origin}/agent/login?code=${a.inviteCode}`)}>Copy login link</button>
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
    const ok = await confirmDialog({
      title: "Rebuild warehouse?",
      body: `Rebuild from ${saved.length} server-side backup(s)? This re-applies every saved state.`,
      confirmText: "Rebuild",
    });
    if (!ok) return;
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
        const parts: { state: string; units: any[]; structure?: any[] }[] = Array.isArray(json.states) ? json.states : [{ state: json.state, units: json.units, structure: json.structure }];
        for (const p of parts) {
          setBusy(p.state || f.name);
          const r = await api("/api/admin/geo/import", { method: "POST", body: JSON.stringify({ state: p.state, units: p.units, structure: p.structure, replace: replaceMode }) });
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

/* -------- Ballot: ensure all INEC parties + candidates exist -------- */
function BallotCard({ onFlash }: { onFlash: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ total: number; candidates: number } | null>(null);
  useEffect(() => {
    api("/api/admin/parties/seed").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j) setInfo({ total: (j.present || j.defaults || []).length && j.present ? j.present.length : 0, candidates: 0 });
    }).catch(() => {});
  }, []);
  async function seed() {
    setBusy(true);
    try {
      const r = await api("/api/admin/parties/seed", { method: "POST" });
      const j = await r.json();
      if (r.ok) { onFlash(`Ballot ready: ${j.total} parties, ${j.candidates} candidates (added ${j.addedParties} parties, ${j.addedCandidates} candidates).`); setInfo({ total: j.total, candidates: j.candidates }); }
      else onFlash(j.error || "Could not seed ballot.");
    } catch { onFlash("Network error."); }
    finally { setBusy(false); }
  }
  return (
    <section className="card p-5">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Ballot</h2>
      <p className="text-sm text-muted">Agents enter votes per party under Scores. If the ballot is empty, add all registered INEC parties (each gets a candidate so it shows up).{info ? ` Currently ${info.candidates} candidate${info.candidates === 1 ? "" : "s"} on the ballot.` : ""}</p>
      <button className="btn-primary mt-3" disabled={busy} onClick={seed}>{busy ? "Adding…" : "Add all INEC parties to the ballot"}</button>
      <p className="mt-2 text-[11px] text-muted">Then trim any parties not contesting from the list. Safe to run more than once.</p>
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

type TenantRow = { slug: string; name: string; contactEmail: string | null; electionName: string; type: string | null; status: string | null; seats: number | null; createdAt: string };

// Super-admin only: every tenant (election room), with links to open each one
// and experience its branded room / admin.
function TenantsPanel() {
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  function load() {
    api("/api/admin/tenants").then((r) => (r.ok ? r.json() : { tenants: [] })).then((j) => { setRows(j.tenants || []); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function resetTenant(t: TenantRow) {
    const ok = await confirmDialog({
      title: `Reset "${t.electionName}"?`,
      body: "This permanently deletes ALL messages, incidents, updates, scores AND agent codes for this room — everything goes back to zero. The ballot and geography are kept.",
      confirmText: "Reset to zero", danger: true,
    });
    if (!ok) return;
    setBusy(t.slug);
    try {
      const r = await api(`/api/admin/tenants/${t.slug}`, { method: "POST", body: JSON.stringify({ action: "reset" }) });
      const j = await r.json();
      await alertDialog({
        title: r.ok ? "Reset done" : "Reset failed",
        body: r.ok ? `Cleared ${j.removed?.submissions || 0} submissions, ${j.removed?.instructions || 0} instructions and ${j.removed?.agents || 0} codes.` : (j.error || "Reset failed."),
      });
    } finally { setBusy(""); load(); }
  }
  async function deleteTenant(t: TenantRow) {
    const typed = await promptDialog({
      title: `Delete "${t.electionName}"?`,
      body: `This PERMANENTLY deletes the room and ALL its data (agents, scores, everything). Type the slug to confirm:\n${t.slug}`,
      placeholder: t.slug, confirmText: "Delete permanently", danger: true,
    });
    if (typed !== t.slug) { if (typed !== null) await alertDialog({ title: "Nothing deleted", body: "Slug did not match." }); return; }
    setBusy(t.slug);
    try {
      const r = await api(`/api/admin/tenants/${t.slug}?confirm=${encodeURIComponent(t.slug)}`, { method: "DELETE" });
      const j = await r.json();
      await alertDialog({ title: r.ok ? "Deleted" : "Delete failed", body: r.ok ? `Deleted ${t.slug}.` : (j.error || "Delete failed.") });
    } finally { setBusy(""); load(); }
  }
  const filtered = q.trim() ? rows.filter((t) => (t.name + " " + t.slug + " " + (t.contactEmail || "")).toLowerCase().includes(q.trim().toLowerCase())) : rows;
  return (
    <main className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">All tenants</h2>
          <p className="mt-0.5 text-sm text-muted">{rows.length} election room{rows.length === 1 ? "" : "s"}. Open any one to experience its branded look &amp; feel.</p>
        </div>
        <input className="input max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / slug / email…" />
      </div>
      {loading ? <p className="text-sm text-muted">Loading…</p> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <div key={t.slug} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-bold" title={t.electionName}>{t.electionName}</div>
                  <div className="tabular text-[11px] text-accent">/{t.slug}</div>
                </div>
                {t.status && <span className="pill shrink-0 bg-ink/10 text-muted">{t.status}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                {t.type && <span>{t.type.replace(/_/g, " ")}</span>}
                {t.seats != null && <span>· {t.seats} seats</span>}
                {t.contactEmail && <span>· {t.contactEmail}</span>}
                <span>· {new Date(t.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`/${t.slug}/room`} className="btn-primary px-3 py-1.5 text-xs">Open room →</a>
                <a href={`/${t.slug}/admin`} className="btn-ghost px-3 py-1.5 text-xs">Admin</a>
                <button onClick={() => resetTenant(t)} disabled={busy === t.slug} className="ml-auto rounded-lg border border-warn/40 px-3 py-1.5 text-xs font-semibold text-warn hover:bg-warn/10">Reset</button>
                <button onClick={() => deleteTenant(t)} disabled={busy === t.slug} className="rounded-lg border border-bad/40 px-3 py-1.5 text-xs font-semibold text-bad hover:bg-bad/10">Delete</button>
              </div>
            </div>
          ))}
          {!filtered.length && <p className="text-sm text-muted">No tenants match “{q}”.</p>}
        </div>
      )}
    </main>
  );
}
