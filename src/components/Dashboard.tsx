"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, logout } from "@/lib/session";
import { getSocket } from "@/lib/socket";
import PartyBadge from "@/components/PartyBadge";
import type { Session } from "@/lib/auth";

type Score = { party: string; color: string; votes: number };
type Media = { url: string; thumbUrl?: string; kind: string; mime: string };
type Item = {
  id: string; type: string; text?: string; severity?: string; confidence?: string;
  scoreStatus?: string; author: string; unitLabel: string;
  scores?: Score[]; media?: Media[]; receivedAt: string; capturedAt?: string;
  accreditedVoters?: number; totalVotesCast?: number; rejectedBallots?: number;
};
type Tally = {
  leaderboard: { party: string; name: string; color: string; verified: number; declared: number; perceived: number }[];
  reporting: { reported: number; verified: number; total: number };
  turnout: { accredited: number; cast: number; rejected: number };
};

const sevColor: Record<string, string> = {
  CRITICAL: "bg-bad text-white", HIGH: "bg-bad/15 text-bad", MEDIUM: "bg-warn/15 text-warn",
  LOW: "bg-panel text-ink", INFO: "bg-panel text-muted",
};
const typeColor: Record<string, string> = {
  INCIDENT: "bg-bad/10 text-bad", SCORE: "bg-accent/10 text-accent", MESSAGE: "bg-panel text-ink", STATUS: "bg-panel text-muted",
};
const fmt = (s?: string) => (s ? new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
const nf = new Intl.NumberFormat();

export default function Dashboard({ session }: { session: Session }) {
  const [election, setElection] = useState<any>(null);
  const [feed, setFeed] = useState<Item[]>([]);
  const [tally, setTally] = useState<Tally | null>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [big, setBig] = useState(false);
  const [summary, setSummary] = useState("");
  const [q, setQ] = useState(""); const [answer, setAnswer] = useState(""); const [asking, setAsking] = useState(false);
  const canVerify = ["ADMIN", "COORDINATOR", "ANALYST"].includes(session.role);
  const tallyTimer = useRef<any>(null);
  const [presence, setPresence] = useState<{ count: number; online: { agentId: string; name: string }[] }>({ count: 0, online: [] });
  const [instrBody, setInstrBody] = useState(""); const [instrSev, setInstrSev] = useState("INFO"); const [sending, setSending] = useState(false);
  const [instrLog, setInstrLog] = useState<any[]>([]);

  async function loadTally() { const r = await api("/api/tally"); if (r.ok) setTally(await r.json()); }
  async function loadFeed() { const r = await api("/api/submissions?limit=100"); if (r.ok) setFeed((await r.json()).submissions); }
  async function loadSummary() { const r = await api("/api/ai/summary"); if (r.ok) setSummary((await r.json()).summary); }
  async function loadInstr() { const r = await api("/api/instructions"); if (r.ok) setInstrLog((await r.json()).instructions || []); }
  async function loadPresence() { const r = await api("/api/presence"); if (r.ok) setPresence(await r.json()); }
  function scheduleTally() { clearTimeout(tallyTimer.current); tallyTimer.current = setTimeout(loadTally, 800); }

  useEffect(() => {
    api("/api/bootstrap").then(async (r) => r.ok && setElection((await r.json()).election));
    loadFeed(); loadTally(); loadSummary(); loadInstr(); loadPresence();

    // Live over Socket.IO (bridged from the server event bus).
    const sock = getSocket();
    const onLive = (ev: any) => {
      if (ev.kind === "submission") { setFeed((f) => [ev.payload as Item, ...f].slice(0, 200)); if ((ev.payload as Item).type === "SCORE") scheduleTally(); }
      else if (ev.kind === "verify") { setFeed((f) => f.map((x) => (x.id === ev.payload.id ? { ...x, scoreStatus: ev.payload.status } : x))); scheduleTally(); }
    };
    sock.on("live", onLive);
    sock.on("presence:update", (p: any) => setPresence(p));
    sock.on("receipt:update", () => loadInstr());
    sock.on("instruction:new", () => loadInstr());

    const poll = setInterval(() => { loadTally(); }, 20000);
    const aiPoll = setInterval(loadSummary, 60000);
    return () => { sock.off("live", onLive); sock.off("presence:update"); sock.off("receipt:update"); sock.off("instruction:new"); clearInterval(poll); clearInterval(aiPoll); };
  }, []); // eslint-disable-line

  async function sendInstruction() {
    if (!instrBody.trim()) return;
    setSending(true);
    const r = await api("/api/instructions", { method: "POST", body: JSON.stringify({ target: "ALL", body: instrBody, severity: instrSev }) });
    setSending(false);
    if (r.ok) { setInstrBody(""); loadInstr(); }
  }

  async function verify(id: string, status: string) {
    const r = await api(`/api/submissions/${id}/verify`, { method: "POST", body: JSON.stringify({ status }) });
    if (r.ok) { setFeed((f) => f.map((x) => (x.id === id ? { ...x, scoreStatus: status } : x))); scheduleTally(); }
  }

  async function ask() {
    if (!q.trim()) return;
    setAsking(true); setAnswer("");
    const r = await api("/api/ai/ask", { method: "POST", body: JSON.stringify({ question: q }) });
    const j = await r.json(); setAnswer(j.answer || j.error || "No answer"); setAsking(false);
  }

  const shown = useMemo(() => (filter === "ALL" ? feed : feed.filter((x) => x.type === filter)), [feed, filter]);
  const incidents = useMemo(() => feed.filter((x) => x.type === "INCIDENT"), [feed]);
  const maxVote = useMemo(() => Math.max(1, ...(tally?.leaderboard.flatMap((l) => [l.verified, l.declared]) || [1])), [tally]);
  const pct = (n: number) => Math.round((n / maxVote) * 100);
  const reportPct = tally ? Math.round((tally.reporting.verified / Math.max(1, tally.reporting.total)) * 100) : 0;
  // Parties listed alphabetically; the front-runner is flagged separately.
  const board = useMemo(() => [...(tally?.leaderboard || [])].sort((a, b) => a.party.localeCompare(b.party)), [tally]);
  const leadingParty = useMemo(
    () => (tally?.leaderboard || []).reduce<{ party: string; verified: number } | null>((m, l) => (l.verified > (m?.verified ?? -1) ? l : m), null)?.party,
    [tally]
  );

  return (
    <div className={big ? "bigscreen min-h-dvh" : "min-h-dvh"}>
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-md sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="live-dot text-bad"><span className="block h-2.5 w-2.5 rounded-full bg-bad" /></span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Situation Room · Live</div>
            <div className="truncate text-base font-bold tracking-tight sm:text-lg">{election?.name || "—"}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {tally && <span className="pill bg-white/5 text-ink">Rep. <b className="tabular text-ink">{tally.reporting.verified}/{tally.reporting.total}</b> · {reportPct}%</span>}
          <span className="pill bg-good/10 text-good"><span className="h-1.5 w-1.5 rounded-full bg-good" /> {presence.count} online</span>
          {!big && (session.role === "ADMIN" || session.role === "COORDINATOR") && <a href="/admin" className="btn-ghost px-3 py-1.5">Admin</a>}
          <button className="btn-ghost hidden px-3 py-1.5 sm:inline-flex" onClick={() => setBig((b) => !b)}>{big ? "Exit big screen" : "Big screen"}</button>
          {!big && <button className="text-xs text-muted hover:text-ink" onClick={async () => { await logout(); location.reload(); }}>Sign out</button>}
        </div>
      </header>

      <main className={`grid gap-4 p-4 ${big ? "grid-cols-2" : "lg:grid-cols-3"}`}>
        {/* Tally */}
        <section className="card p-5">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted">Score tally</h2>
          <div className="space-y-4">
            {board.map((l) => (
              <div key={l.party}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <PartyBadge code={l.party} color={l.color} size={30} />
                    <span className="min-w-0 leading-tight">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-bold">{l.party}</span>
                        {l.party === leadingParty && l.verified > 0 && <span className="pill bg-good/15 text-good">Leading</span>}
                      </span>
                      <span className="block truncate text-xs text-muted">{l.name}</span>
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-2xl font-extrabold">{nf.format(l.verified)}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct(l.verified)}%`, background: l.color, boxShadow: `0 0 12px ${l.color}` }} />
                </div>
                <div className="mt-1 text-[11px] text-muted">declared <span className="tabular text-ink/70">{nf.format(l.declared)}</span> · perceived <span className="tabular text-ink/70">{nf.format(l.perceived)}</span></div>
              </div>
            ))}
            {!tally?.leaderboard.length && <p className="text-sm text-muted">No scores yet.</p>}
          </div>
          {tally && (
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
              <div><div className="tabular text-lg font-bold">{nf.format(tally.turnout.accredited)}</div><div className="text-[11px] uppercase tracking-wide text-muted">Accredited</div></div>
              <div><div className="tabular text-lg font-bold">{nf.format(tally.turnout.cast)}</div><div className="text-[11px] uppercase tracking-wide text-muted">Cast</div></div>
              <div><div className="tabular text-lg font-bold text-bad">{nf.format(tally.turnout.rejected)}</div><div className="text-[11px] uppercase tracking-wide text-muted">Rejected</div></div>
            </div>
          )}
        </section>

        {/* Live wall */}
        <section className="card flex flex-col p-4 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Live wall</h2>
            <select className="input w-auto py-1 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="ALL">All</option><option value="INCIDENT">Incidents</option><option value="SCORE">Scores</option><option value="MESSAGE">Messages</option><option value="STATUS">Status</option>
            </select>
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {shown.map((it) => (
              <article key={it.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className={`pill ${typeColor[it.type] || "bg-panel"}`}>{it.type}</span>
                  <span className="text-muted">{fmt(it.receivedAt)}</span>
                </div>
                <div className="mt-1 text-sm">{it.text}</div>
                {it.severity && <span className={`pill mt-1 ${sevColor[it.severity] || "bg-panel"}`}>{it.severity}</span>}
                {!!it.scores?.length && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {[...it.scores].sort((a, b) => a.party.localeCompare(b.party)).map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-white/5 py-0.5 pl-0.5 pr-2 text-xs font-semibold">
                        <PartyBadge code={s.party} color={s.color} size={18} /> {nf.format(s.votes)}
                      </span>
                    ))}
                    {it.confidence && <span className="pill bg-white/5">{it.confidence}</span>}
                  </div>
                )}
                {!!it.media?.length && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {it.media.map((m, i) => m.mime.startsWith("video/")
                      ? <video key={i} src={m.url} controls className="h-24 rounded border border-line" />
                      : m.mime.startsWith("audio/")
                        ? <audio key={i} src={m.url} controls className="w-full" />
                        : <a key={i} href={m.url} target="_blank" rel="noreferrer"><img src={m.thumbUrl || m.url} className="h-24 rounded border border-line object-cover" alt={m.kind} /></a>)}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between text-xs text-muted">
                  <span>{it.author} · {it.unitLabel}</span>
                  {it.type === "SCORE" && (
                    <span className="flex items-center gap-2">
                      <span className={`pill ${it.scoreStatus === "VERIFIED" ? "bg-good/15 text-good" : it.scoreStatus === "DISPUTED" ? "bg-bad/15 text-bad" : "bg-panel"}`}>{it.scoreStatus}</span>
                      {canVerify && it.scoreStatus !== "VERIFIED" && <button className="text-good underline" onClick={() => verify(it.id, "VERIFIED")}>Verify</button>}
                      {canVerify && it.scoreStatus !== "DISPUTED" && <button className="text-bad underline" onClick={() => verify(it.id, "DISPUTED")}>Dispute</button>}
                    </span>
                  )}
                </div>
              </article>
            ))}
            {!shown.length && <p className="text-sm text-muted">Nothing yet.</p>}
          </div>
        </section>

        {/* Instructions + presence + AI + incidents */}
        <section className="space-y-4">
          {canVerify && (
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">Send instruction to agents</h2>
              <textarea className="input min-h-16" value={instrBody} onChange={(e) => setInstrBody(e.target.value)} placeholder="Instruction broadcast to all agents…" />
              <div className="mt-2 flex items-center gap-2">
                <select className="input w-auto py-1 text-xs" value={instrSev} onChange={(e) => setInstrSev(e.target.value)}>
                  <option>INFO</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
                </select>
                <button className="btn-primary flex-1" disabled={sending || !instrBody.trim()} onClick={sendInstruction}>{sending ? "Sending…" : "Broadcast"}</button>
              </div>
              <div className="mt-3 max-h-40 space-y-1 overflow-y-auto border-t border-line pt-2 text-xs">
                {instrLog.map((i) => (
                  <div key={i.id} className="flex items-center justify-between">
                    <span className="truncate pr-2">{i.body}</span>
                    <span className="shrink-0 text-muted">{i.read}/{i.delivered}/{i.total} read/deliv/sent</span>
                  </div>
                ))}
                {!instrLog.length && <p className="text-muted">No instructions sent.</p>}
              </div>
              {presence.online?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
                  {presence.online.map((a) => <span key={a.agentId} className="pill bg-good/10 text-good">● {a.name}</span>)}
                </div>
              )}
            </div>
          )}

          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">AI analysis</h2>
              <button className="text-xs text-accent underline" onClick={loadSummary}>Refresh</button>
            </div>
            <div className="whitespace-pre-wrap text-sm text-ink">{summary || "No summary yet."}</div>
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex gap-2">
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about the data…" onKeyDown={(e) => e.key === "Enter" && ask()} />
                <button className="btn-primary" disabled={asking} onClick={ask}>{asking ? "…" : "Ask"}</button>
              </div>
              {answer && <div className="mt-2 whitespace-pre-wrap rounded-lg bg-panel p-3 text-sm">{answer}</div>}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Incident board</h2>
            <div className="grid grid-cols-2 gap-2">
              {incidents.slice(0, 8).map((it) => (
                <div key={it.id} className="rounded-lg border border-line p-2">
                  {it.media?.[0] && !it.media[0].mime.startsWith("audio/") && (
                    it.media[0].mime.startsWith("video/")
                      ? <video src={it.media[0].url} className="mb-1 h-20 w-full rounded object-cover" />
                      : <img src={it.media[0].thumbUrl || it.media[0].url} className="mb-1 h-20 w-full rounded object-cover" alt="" />
                  )}
                  <span className={`pill ${sevColor[it.severity || "INFO"]}`}>{it.severity}</span>
                  <div className="mt-1 line-clamp-2 text-xs">{it.text}</div>
                  <div className="text-[10px] text-muted">{it.unitLabel}</div>
                </div>
              ))}
              {!incidents.length && <p className="col-span-2 text-sm text-muted">No incidents.</p>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
