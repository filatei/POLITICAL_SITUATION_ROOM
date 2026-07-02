"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, clearAuth } from "@/lib/session";
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

  async function loadTally() { const r = await api("/api/tally"); if (r.ok) setTally(await r.json()); }
  async function loadFeed() { const r = await api("/api/submissions?limit=100"); if (r.ok) setFeed((await r.json()).submissions); }
  async function loadSummary() { const r = await api("/api/ai/summary"); if (r.ok) setSummary((await r.json()).summary); }
  function scheduleTally() { clearTimeout(tallyTimer.current); tallyTimer.current = setTimeout(loadTally, 800); }

  useEffect(() => {
    api("/api/bootstrap").then(async (r) => r.ok && setElection((await r.json()).election));
    loadFeed(); loadTally(); loadSummary();

    const es = new EventSource("/api/stream");
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.kind === "submission") { setFeed((f) => [ev.payload as Item, ...f].slice(0, 200)); if ((ev.payload as Item).type === "SCORE") scheduleTally(); }
        else if (ev.kind === "verify") {
          setFeed((f) => f.map((x) => (x.id === ev.payload.id ? { ...x, scoreStatus: ev.payload.status } : x)));
          scheduleTally();
        }
      } catch {}
    };
    const poll = setInterval(() => { loadTally(); }, 20000);
    const aiPoll = setInterval(loadSummary, 60000);
    return () => { es.close(); clearInterval(poll); clearInterval(aiPoll); };
  }, []); // eslint-disable-line

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

  return (
    <div className={big ? "bigscreen min-h-dvh" : "min-h-dvh"}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white/90 px-4 py-3 backdrop-blur">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Situation Room</div>
          <div className="font-semibold">{election?.name || "—"}</div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {tally && <span className="pill bg-panel">Reporting {tally.reporting.verified}/{tally.reporting.total} PUs · {reportPct}%</span>}
          <button className="btn-ghost" onClick={() => setBig((b) => !b)}>{big ? "Exit big screen" : "Big screen"}</button>
          {!big && <button className="text-xs text-muted underline" onClick={() => { clearAuth(); location.reload(); }}>Sign out</button>}
        </div>
      </header>

      <main className={`grid gap-4 p-4 ${big ? "grid-cols-2" : "lg:grid-cols-3"}`}>
        {/* Tally */}
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Score tally</h2>
          <div className="space-y-3">
            {tally?.leaderboard.map((l) => (
              <div key={l.party}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><span className="pill text-white" style={{ background: l.color }}>{l.party}</span><span className="text-muted">{l.name}</span></span>
                  <span className="font-semibold tabular-nums">{nf.format(l.verified)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-panel">
                  <div className="h-full rounded" style={{ width: `${pct(l.verified)}%`, background: l.color }} />
                </div>
                <div className="mt-0.5 text-xs text-muted">declared {nf.format(l.declared)} · perceived {nf.format(l.perceived)}</div>
              </div>
            ))}
            {!tally?.leaderboard.length && <p className="text-sm text-muted">No scores yet.</p>}
          </div>
          {tally && (
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center text-xs">
              <div><div className="font-semibold tabular-nums">{nf.format(tally.turnout.accredited)}</div><div className="text-muted">Accredited</div></div>
              <div><div className="font-semibold tabular-nums">{nf.format(tally.turnout.cast)}</div><div className="text-muted">Cast</div></div>
              <div><div className="font-semibold tabular-nums">{nf.format(tally.turnout.rejected)}</div><div className="text-muted">Rejected</div></div>
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
                  <div className="mt-2 flex flex-wrap gap-1">
                    {it.scores.map((s, i) => <span key={i} className="pill text-white" style={{ background: s.color }}>{s.party} {nf.format(s.votes)}</span>)}
                    {it.confidence && <span className="pill bg-panel">{it.confidence}</span>}
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

        {/* AI + incidents */}
        <section className="space-y-4">
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
