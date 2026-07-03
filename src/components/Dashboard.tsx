"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, logout } from "@/lib/session";
import { getSocket } from "@/lib/socket";
import PartyBadge from "@/components/PartyBadge";
import AiChat from "@/components/AiChat";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
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
// Bulk-created agents are named "Agent <unit>", which duplicates the unit label.
// Drop the author when it's already contained in the unit label.
function sourceLabel(author?: string, unitLabel?: string): string {
  const a = (author || "").trim();
  const l = (unitLabel || "").trim();
  if (!a) return l;
  if (!l || l === "—") return a;
  const clean = a.replace(/^agent\s+/i, "").trim();
  if (clean && l.toLowerCase().includes(clean.toLowerCase())) return l;
  return `${a} · ${l}`;
}
const nf = new Intl.NumberFormat();

export default function Dashboard({ session }: { session: Session }) {
  const [election, setElection] = useState<any>(null);
  const [feed, setFeed] = useState<Item[]>([]);
  const [tally, setTally] = useState<Tally | null>(null);
  const [big, setBig] = useState(false);
  const [summary, setSummary] = useState("");
  const [q, setQ] = useState(""); const [answer, setAnswer] = useState(""); const [asking, setAsking] = useState(false);
  const canVerify = ["ADMIN", "COORDINATOR", "ANALYST"].includes(session.role);
  const tallyTimer = useRef<any>(null);
  const [presence, setPresence] = useState<{ count: number; online: { agentId: string; name: string }[] }>({ count: 0, online: [] });
  const [instrBody, setInstrBody] = useState(""); const [instrSev, setInstrSev] = useState("INFO"); const [sending, setSending] = useState(false);
  const [instrLog, setInstrLog] = useState<any[]>([]);

  const seenScores = useRef<Set<string>>(new Set());
  const [splash, setSplash] = useState<null | { unit: string; lead: string; color: string; votes: number }>(null);
  const splashTimer = useRef<any>(null);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);
  const acRef = useRef<AudioContext | null>(null);

  async function loadTally() { const r = await api("/api/tally"); if (r.ok) setTally(await r.json()); }
  async function loadFeed() {
    const r = await api("/api/submissions?limit=100");
    if (r.ok) {
      const subs = (await r.json()).submissions as Item[];
      subs.forEach((s) => { if (s.type === "SCORE") seenScores.current.add(s.id); }); // don't chime for history
      setFeed(subs);
    }
  }
  async function loadSummary() { const r = await api("/api/ai/summary"); if (r.ok) setSummary((await r.json()).summary); }
  async function loadInstr() { const r = await api("/api/instructions"); if (r.ok) setInstrLog((await r.json()).instructions || []); }
  async function loadPresence() { const r = await api("/api/presence"); if (r.ok) setPresence(await r.json()); }
  function scheduleTally() { clearTimeout(tallyTimer.current); tallyTimer.current = setTimeout(loadTally, 800); }

  // A short two-note chime on a fresh score (WebAudio — no asset, resumes on gesture).
  function playChime() {
    if (!soundOnRef.current) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!acRef.current) acRef.current = new AC();
      const ac = acRef.current!;
      if (ac.state === "suspended") ac.resume();
      const now = ac.currentTime;
      [880, 1320].forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
        const t = now + i * 0.14;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.start(t); o.stop(t + 0.24);
      });
    } catch { /* audio blocked until a gesture — silently ignore */ }
  }

  function triggerScoreArrival(it: Item) {
    const top = [...(it.scores || [])].sort((a, b) => b.votes - a.votes)[0];
    setSplash({ unit: it.unitLabel || "—", lead: top?.party || "", color: top?.color || "#6b7cff", votes: top?.votes || 0 });
    clearTimeout(splashTimer.current);
    splashTimer.current = setTimeout(() => setSplash(null), 5000);
    playChime();
  }

  useEffect(() => {
    api("/api/bootstrap").then(async (r) => r.ok && setElection((await r.json()).election));
    loadFeed(); loadTally(); loadSummary(); loadInstr(); loadPresence();

    // Live over Socket.IO (bridged from the server event bus).
    const sock = getSocket();
    const onLive = (ev: any) => {
      if (ev.kind === "submission") {
        const p = ev.payload as Item;
        setFeed((f) => [p, ...f].slice(0, 200));
        if (p.type === "SCORE") {
          scheduleTally();
          if (!seenScores.current.has(p.id)) { seenScores.current.add(p.id); triggerScoreArrival(p); }
        }
      } else if (ev.kind === "verify") {
        setFeed((f) => f.map((x) => (x.id === ev.payload.id ? { ...x, scoreStatus: ev.payload.status } : x)));
        scheduleTally();
      }
    };
    sock.on("live", onLive);
    sock.on("presence:update", (p: any) => setPresence(p));
    sock.on("receipt:update", () => loadInstr());
    sock.on("instruction:new", () => loadInstr());

    // Poll tally + presence as a fallback: Cloudflare idles websockets out after
    // ~100s, so we can't rely on presence:update alone to keep "online" current.
    const poll = setInterval(() => { loadTally(); loadPresence(); }, 15000);
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

  // Scores grouped by polling unit; the unit with the newest report bubbles up.
  const scoreGroups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of feed) {
      if (it.type !== "SCORE") continue;
      const k = it.unitLabel || "—";
      (m.get(k) ?? m.set(k, []).get(k)!).push(it);
    }
    return [...m.entries()]
      .map(([unit, items]) => {
        const sorted = [...items].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
        return { unit, latest: sorted[0], count: items.length, lastAt: new Date(sorted[0].receivedAt).getTime() };
      })
      .sort((a, b) => b.lastAt - a.lastAt);
  }, [feed]);
  // Everything that isn't a score: incidents + casual updates/status, newest first.
  const activity = useMemo(() => feed.filter((x) => x.type !== "SCORE"), [feed]);
  const maxVote = useMemo(() => Math.max(1, ...(tally?.leaderboard.flatMap((l) => [l.verified, l.declared]) || [1])), [tally]);
  const pct = (n: number) => Math.round((n / maxVote) * 100);
  const reportPct = tally ? Math.round((tally.reporting.verified / Math.max(1, tally.reporting.total)) * 100) : 0;
  // Parties listed alphabetically; the front-runner is flagged separately.
  const board = useMemo(() => [...(tally?.leaderboard || [])].sort((a, b) => a.party.localeCompare(b.party)), [tally]);
  const leadingParty = useMemo(
    () => (tally?.leaderboard || []).reduce<{ party: string; verified: number } | null>((m, l) => (l.verified > (m?.verified ?? -1) ? l : m), null)?.party,
    [tally]
  );

  const [menu, setMenu] = useState(false);
  const [mtab, setMtab] = useState<"tally" | "scores" | "activity">("scores");
  const [themeName, setThemeName] = useState<Theme>("dark");
  useEffect(() => { setThemeName(getTheme()); }, []);
  function toggleTheme() { const n: Theme = themeName === "light" ? "dark" : "light"; setTheme(n); setThemeName(n); }
  const initials = (session.name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const menuRow = "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-ink/5";

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
        <div className="flex shrink-0 items-center gap-2 text-sm">
          {tally && <span className="pill bg-white/5 text-ink">Rep. <b className="tabular text-ink">{tally.reporting.verified}/{tally.reporting.total}</b> · {reportPct}%</span>}
          <span className="pill bg-good/10 text-good"><span className="h-1.5 w-1.5 rounded-full bg-good" /> {presence.count}</span>
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} aria-label="Account menu"
              className="grid h-9 w-9 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent ring-1 ring-inset ring-accent/40">{initials}</button>
            {menu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
                <div className="sheet-in absolute right-0 z-30 mt-2 w-60 origin-top-right rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
                  <div className="px-3 py-2">
                    <div className="truncate text-sm font-semibold">{session.name}</div>
                    <div className="text-[11px] uppercase tracking-wide text-muted">{session.role}</div>
                  </div>
                  <div className="my-1 h-px bg-line" />
                  <button className={menuRow} onClick={() => { setSoundOn((s) => !s); if (!soundOn) playChime(); }}>
                    <span>Score alert sound</span><span className="text-muted">{soundOn ? "On 🔔" : "Off 🔕"}</span>
                  </button>
                  <button className={menuRow} onClick={toggleTheme}>
                    <span>Appearance</span><span className="text-muted">{themeName === "light" ? "Light ☀︎" : "Dark ☾"}</span>
                  </button>
                  <button className={`${menuRow} hidden sm:flex`} onClick={() => { setBig((b) => !b); setMenu(false); }}>
                    <span>{big ? "Exit big screen" : "Big screen"}</span><span className="text-muted">🖥</span>
                  </button>
                  {(session.role === "ADMIN" || session.role === "COORDINATOR") && (
                    <a href="/admin" className={menuRow}><span>Admin console</span><span className="text-muted">→</span></a>
                  )}
                  <div className="my-1 h-px bg-line" />
                  <button className={`${menuRow} text-bad`} onClick={async () => { await logout(); location.reload(); }}>
                    <span>Sign out</span><span>⏻</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {!big && (
        <div className="sticky top-[56px] z-[9] flex gap-1 border-b border-line bg-surface/85 p-2 backdrop-blur-md lg:hidden">
          {(["tally", "scores", "activity"] as const).map((t) => (
            <button key={t} onClick={() => setMtab(t)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${mtab === t ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/40" : "text-muted"}`}>
              {t === "tally" ? "Tally" : t === "scores" ? "Scores" : "Incidents"}
            </button>
          ))}
        </div>
      )}

      <main className={`grid gap-4 p-4 ${big ? "grid-cols-2" : "lg:grid-cols-3"}`}>
        {/* Tally */}
        <section className={`card p-5 ${mtab === "tally" ? "" : "hidden"} lg:block`}>
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

        {/* Scores by unit */}
        <section className={`card flex-col p-4 ${mtab === "scores" ? "flex" : "hidden"} lg:flex`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Scores by unit</h2>
            <span className="pill bg-white/5 text-muted">{scoreGroups.length} unit{scoreGroups.length === 1 ? "" : "s"}</span>
          </div>
          {splash && (
            <div key={splash.unit + splash.votes} className="splash-in mb-3 flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: splash.color, boxShadow: `0 0 22px ${splash.color}55` }}>
              <PartyBadge code={splash.lead} color={splash.color} size={36} />
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: splash.color }}>New score in</div>
                <div className="truncate text-sm font-bold">{splash.unit}</div>
              </div>
              <div className="ml-auto shrink-0 text-right">
                <div className="text-[10px] uppercase tracking-wide text-muted">{splash.lead} leads</div>
                <div className="tabular text-lg font-extrabold">{nf.format(splash.votes)}</div>
              </div>
            </div>
          )}
          <div className="max-h-[74vh] space-y-2 overflow-y-auto pr-1">
            {scoreGroups.map((g) => {
              const it = g.latest;
              return (
                <article key={g.unit} className="rounded-lg border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{g.unit}</div>
                      <div className="text-[11px] text-muted">{fmt(it.receivedAt)} · {it.confidence || "—"} · {g.count} report{g.count === 1 ? "" : "s"}</div>
                    </div>
                    <span className={`pill shrink-0 ${it.scoreStatus === "VERIFIED" ? "bg-good/15 text-good" : it.scoreStatus === "DISPUTED" ? "bg-bad/15 text-bad" : "bg-panel"}`}>{it.scoreStatus}</span>
                  </div>
                  {(() => {
                    const nz = [...(it.scores || [])].filter((s) => s.votes > 0).sort((a, b) => b.votes - a.votes || a.party.localeCompare(b.party));
                    return nz.length ? (
                      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {nz.map((s, i) => (
                          <span key={i} className="flex items-center gap-2 rounded-lg border border-line bg-white/[0.03] px-2 py-1.5">
                            <PartyBadge code={s.party} color={s.color} size={22} />
                            <span className="min-w-0 leading-tight">
                              <span className="block text-xs font-bold">{s.party}</span>
                              <span className="tabular block text-sm font-extrabold">{nf.format(s.votes)}</span>
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : <p className="mt-2 text-xs text-muted">No votes recorded on this report.</p>;
                  })()}
                  {!!it.media?.length && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {it.media.map((m, i) => m.mime.startsWith("video/")
                        ? <video key={i} src={m.url} controls className="h-24 rounded border border-line" />
                        : m.mime.startsWith("audio/")
                          ? <audio key={i} src={m.url} controls className="w-full" />
                          : <a key={i} href={m.url} target="_blank" rel="noreferrer"><img src={m.thumbUrl || m.url} className="h-24 rounded border border-line object-cover" alt={m.kind} /></a>)}
                    </div>
                  )}
                  {canVerify && (
                    <div className="mt-2 flex items-center justify-end gap-3 text-xs">
                      {it.scoreStatus !== "VERIFIED" && <button className="font-semibold text-good underline" onClick={() => verify(it.id, "VERIFIED")}>Verify</button>}
                      {it.scoreStatus !== "DISPUTED" && <button className="font-semibold text-bad underline" onClick={() => verify(it.id, "DISPUTED")}>Dispute</button>}
                    </div>
                  )}
                </article>
              );
            })}
            {!scoreGroups.length && <p className="text-sm text-muted">No scores yet.</p>}
          </div>
        </section>

        {/* Activity (incidents + updates) + AI + instructions */}
        <section className={`space-y-4 ${mtab === "activity" ? "" : "hidden"} lg:block`}>
          <div className="card flex flex-col p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Incidents &amp; updates</h2>
              <span className="pill bg-white/5 text-muted">{activity.length}</span>
            </div>
            <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
              {activity.map((it) => (
                <article key={it.id} className={`rounded-lg border p-3 ${it.type === "INCIDENT" ? "border-bad/40 bg-bad/[0.04]" : "border-line"}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`pill ${typeColor[it.type] || "bg-panel"}`}>{it.type}</span>
                    <span className="text-muted">{fmt(it.receivedAt)}</span>
                  </div>
                  {it.text && <div className="mt-1 text-sm">{it.text}</div>}
                  {it.severity && <span className={`pill mt-1 ${sevColor[it.severity] || "bg-panel"}`}>{it.severity}</span>}
                  {!!it.media?.length && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {it.media.map((m, i) => m.mime.startsWith("video/")
                        ? <video key={i} src={m.url} controls className="h-24 rounded border border-line" />
                        : m.mime.startsWith("audio/")
                          ? <audio key={i} src={m.url} controls className="w-full" />
                          : <a key={i} href={m.url} target="_blank" rel="noreferrer"><img src={m.thumbUrl || m.url} className="h-24 rounded border border-line object-cover" alt={m.kind} /></a>)}
                    </div>
                  )}
                  <div className="mt-2 text-xs text-muted">{sourceLabel(it.author, it.unitLabel)}</div>
                </article>
              ))}
              {!activity.length && <p className="text-sm text-muted">No incidents or updates yet.</p>}
            </div>
          </div>

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
              <div className="mt-3 max-h-32 space-y-1 overflow-y-auto border-t border-line pt-2 text-xs">
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
          </div>

          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Ask the assistant</h2>
            <AiChat compact />
          </div>
        </section>
      </main>
    </div>
  );
}
