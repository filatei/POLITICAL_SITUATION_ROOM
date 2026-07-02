"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { api, clearAuth, getToken, getSessionLocal } from "@/lib/session";
import { compressImage } from "@/lib/media";
import { enqueue, count, all as outboxAll, onOutboxChange, drain, type OutboxMedia } from "@/lib/outbox";
import { getSocket } from "@/lib/socket";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import PartyBadge from "@/components/PartyBadge";

type Instr = { receiptId: string; id: string; title?: string; body: string; severity: string; status: string; createdAt: string };
type Cand = { id: string; name: string; party: string; partyName: string; color: string };
type Unit = { id: string; name: string; label: string; registeredVoters: number } | null;
type Mode = "update" | "scores" | "incident";
type ToastT = { msg: string; type: "success" | "error" | "info" } | null;
type Notify = (msg: string, type?: "success" | "error" | "info") => void;

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const set = () => setOnline(navigator.onLine);
    set();
    window.addEventListener("online", set); window.addEventListener("offline", set);
    return () => { window.removeEventListener("online", set); window.removeEventListener("offline", set); };
  }, []);
  return online;
}

function voiceError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed": return "Microphone is blocked. Allow mic access for this site in your browser settings, then retry.";
    case "audio-capture": return "No microphone detected on this device.";
    case "no-speech": return "Didn't catch that — try again and speak clearly.";
    case "network": return "Voice needs internet. Type your update instead.";
    case "aborted": return "Dictation stopped.";
    default: return `Voice capture failed (${code}).`;
  }
}

async function getGeo(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res({});
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res({}),
      { timeout: 4000, maximumAge: 60000 }
    );
  });
}

export default function AgentHome() {
  const router = useRouter();
  const online = useOnline();
  const [mode, setMode] = useState<Mode>("update");
  const [election, setElection] = useState<any>(null);
  const [cands, setCands] = useState<Cand[]>([]);
  const [unit, setUnit] = useState<Unit>(null);
  const [queued, setQueued] = useState(0);
  const [toast, setToast] = useState<ToastT>(null);
  const [instructions, setInstructions] = useState<Instr[]>([]);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncErr, setSyncErr] = useState("");
  const session = getSessionLocal();

  async function syncNow() {
    if (syncing) return;
    setSyncing(true); setSyncErr("");
    await drain();
    const items = await outboxAll();
    setSyncing(false);
    if (items.length === 0) { notify("All updates synced", "success"); }
    else { const e = items.find((i) => i.lastError)?.lastError || "unknown error"; setSyncErr(e); notify("Some updates could not send", "error"); }
  }

  useEffect(() => {
    if (!getToken()) { router.replace("/agent/login"); return; }
    api("/api/bootstrap").then(async (r) => {
      if (r.status === 401) { router.replace("/agent/login"); return; }
      const j = await r.json();
      setElection(j.election); setCands(j.candidates || []); setUnit(j.unit || null);
    });
    const upd = () => count().then(setQueued);
    upd();
    const off = onOutboxChange(upd);
    if (typeof window !== "undefined") navigator.serviceWorker?.addEventListener?.("message", (e: any) => { if (e.data?.type === "drain") drain(); });
    return off;
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!getToken()) return;
    api("/api/instructions").then(async (r) => { if (r.ok) setInstructions((await r.json()).instructions || []); });
    const sock = getSocket();
    const onInstr = (m: Instr) => {
      setInstructions((prev) => (prev.some((x) => x.receiptId === m.receiptId) ? prev : [{ ...m, status: "DELIVERED" }, ...prev]));
      sock.emit("instruction:ack", { receiptId: m.receiptId });
      notify("New instruction from situation room", "info");
    };
    sock.on("instruction", onInstr);
    const hb = setInterval(() => sock.emit("presence"), 25000);
    return () => { sock.off("instruction", onInstr); clearInterval(hb); };
  }, []); // eslint-disable-line

  function notify(msg: string, type: "success" | "error" | "info" = "success") {
    setToast({ msg, type });
    window.clearTimeout((notify as any)._t);
    (notify as any)._t = window.setTimeout(() => setToast(null), 3200);
  }

  function markRead(it: Instr) {
    getSocket().emit("instruction:read", { receiptId: it.receiptId });
    api(`/api/instructions/${it.id}/ack`, { method: "POST", body: JSON.stringify({ status: "READ" }) });
    setInstructions((prev) => prev.map((x) => (x.receiptId === it.receiptId ? { ...x, status: "READ" } : x)));
  }

  async function submit(body: any, files: { file: File; kind: string; sheetSigned?: boolean }[] = []) {
    const geo = await getGeo();
    const media: OutboxMedia[] = [];
    for (const f of files) {
      const blob = f.file.type.startsWith("image/") ? await compressImage(f.file) : f.file;
      media.push({ blob, mime: blob.type || f.file.type, kind: f.kind, sheetSigned: f.sheetSigned });
    }
    await enqueue({ clientUid: uuid(), body: { ...body, ...geo, capturedAt: new Date().toISOString() }, media, createdAt: Date.now(), tries: 0 });
    notify(online ? "Sent to situation room" : "Saved — will sync when online", online ? "success" : "info");
  }

  const initials = (session?.name || "A").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className="mx-auto max-w-md p-4 pb-28">
      <header className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted">{election?.name || "Loading…"}</div>
            <div className="truncate text-lg font-bold">{unit?.name || "—"}</div>
            <div className="truncate text-xs text-muted">{unit?.label}</div>
          </div>
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-sm font-bold text-accent ring-1 ring-inset ring-accent/40" aria-label="Account">
              {initials}
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
                <div className="fade-in absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
                  <div className="border-b border-line px-4 py-3">
                    <div className="truncate font-semibold">{session?.name || "Agent"}</div>
                    <div className="truncate text-xs text-muted">{unit?.name}</div>
                  </div>
                  <button className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-ink/5" onClick={() => { setMenu(false); setSettings(true); }}>⚙️ Settings</button>
                  <button className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-sm text-bad hover:bg-bad/5" onClick={() => { clearAuth(); router.replace("/agent/login"); }}>⏻ Sign out</button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className={`pill ${online ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}><span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-good" : "bg-warn"}`} /> {online ? "Online" : "Offline"}</span>
          {queued > 0 && <span className="pill bg-ink/5 text-ink">{queued} queued</span>}
          {queued > 0 && (
            <button className="inline-flex items-center gap-1.5 font-semibold text-accent disabled:opacity-60" disabled={syncing} onClick={syncNow}>
              <svg className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
              </svg>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
        {syncErr && queued > 0 && (
          <div className="mt-2 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad">
            Couldn&apos;t send {queued} update{queued > 1 ? "s" : ""}: {syncErr}
          </div>
        )}
      </header>

      {instructions.filter((i) => i.status !== "READ").length > 0 && (
        <div className="mb-4 space-y-2">
          {instructions.filter((i) => i.status !== "READ").map((it) => (
            <div key={it.receiptId} className={`card fade-in p-3 ${it.severity === "CRITICAL" || it.severity === "HIGH" ? "ring-1 ring-bad/50" : "ring-1 ring-accent/40"}`}>
              <div className="flex items-center justify-between">
                <span className={`pill ${it.severity === "CRITICAL" || it.severity === "HIGH" ? "bg-bad/15 text-bad" : "bg-accent/15 text-accent"}`}>Instruction · {it.severity}</span>
                <button className="text-xs font-semibold text-accent" onClick={() => markRead(it)}>Mark read</button>
              </div>
              {it.title && <div className="mt-1 font-semibold">{it.title}</div>}
              <div className="mt-1 text-sm">{it.body}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-line bg-ink/5 p-1 text-sm">
        {(["update", "scores", "incident"] as Mode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`rounded-lg px-2 py-2 font-semibold capitalize transition ${mode === m ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/40" : "text-muted hover:text-ink"}`}>{m}</button>
        ))}
      </div>

      {mode === "update" && <UpdateForm onSend={submit} notify={notify} />}
      {mode === "scores" && <ScoresForm cands={cands} unit={unit} onSend={submit} notify={notify} />}
      {mode === "incident" && <IncidentForm onSend={submit} />}

      {settings && <SettingsSheet onClose={() => setSettings(false)} notify={notify} />}

      {toast && (
        <div className={`toast-in fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-xl ${
          toast.type === "error" ? "bg-bad text-white shadow-bad/30" : toast.type === "info" ? "border border-line bg-panel text-ink" : "bg-good text-white shadow-good/30"}`}>
          <span>{toast.type === "error" ? "✕" : toast.type === "info" ? "•" : "✓"}</span>
          {toast.msg}
        </div>
      )}
    </main>
  );
}

/* ---------------- Settings sheet: theme + change PIN ---------------- */
function SettingsSheet({ onClose, notify }: { onClose: () => void; notify: Notify }) {
  const [theme, setTh] = useState<Theme>("dark");
  const [cur, setCur] = useState(""); const [n1, setN1] = useState(""); const [n2, setN2] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTh(getTheme()); }, []);

  function applyTheme(t: Theme) { setTh(t); setTheme(t); }

  async function changePin() {
    if (n1.length < 4) return notify("PIN must be at least 4 digits", "error");
    if (n1 !== n2) return notify("PINs do not match", "error");
    setBusy(true);
    const r = await api("/api/agent/change-pin", { method: "POST", body: JSON.stringify({ currentPin: cur, newPin: n1 }) });
    setBusy(false);
    const j = await r.json();
    if (r.ok) { notify("PIN updated"); setCur(""); setN1(""); setN2(""); }
    else notify(j.error || "Failed", "error");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}>
      <div className="sheet-in card w-full max-w-md space-y-5 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Settings</h2>
          <button className="text-muted hover:text-ink" onClick={onClose}>✕</button>
        </div>

        <div>
          <div className="label">Appearance</div>
          <div className="grid grid-cols-2 gap-2">
            {(["dark", "light"] as Theme[]).map((t) => (
              <button key={t} onClick={() => applyTheme(t)}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold capitalize transition ${theme === t ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:text-ink"}`}>
                {t === "dark" ? "🌙 Dark" : "☀️ Light"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          <div className="label">Change PIN</div>
          <input className="input" type="password" inputMode="numeric" placeholder="Current PIN" value={cur} onChange={(e) => setCur(e.target.value)} />
          <input className="input" type="password" inputMode="numeric" placeholder="New PIN" value={n1} onChange={(e) => setN1(e.target.value)} />
          <input className="input" type="password" inputMode="numeric" placeholder="Confirm new PIN" value={n2} onChange={(e) => setN2(e.target.value)} />
          <button className="btn-primary w-full" disabled={busy} onClick={changePin}>Update PIN</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Update (message + voice) ---------------- */
function UpdateForm({ onSend, notify }: { onSend: (b: any, f?: any[]) => Promise<void>; notify: Notify }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceUsed, setVoiceUsed] = useState(false);
  const recRef = useRef<any>(null);
  const baseRef = useRef("");

  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { notify("Voice-to-text isn't supported on this browser", "error"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = "en-NG";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    baseRef.current = text.trim();
    // Rebuild the FULL transcript each event (interim + final) and append to the
    // text that was present when dictation started — no duplicated fragments.
    rec.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      const joined = (baseRef.current ? baseRef.current + " " : "") + t.trim();
      setText(joined);
      setVoiceUsed(true);
    };
    rec.onerror = (e: any) => {
      setListening(false);
      const c = e?.error || "error";
      if (c !== "aborted" && c !== "no-speech") notify(voiceError(c), "error");
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); notify("Could not start dictation", "error"); }
  }

  return (
    <div className="card space-y-3 p-4">
      <label className="label">Message to the situation room</label>
      <textarea className="input min-h-28" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or dictate an update…" />
      <div className="flex gap-2">
        <button className={`btn-ghost ${listening ? "!border-bad !text-bad" : ""}`} onClick={toggleVoice}>
          {listening ? <><span className="live-dot text-bad"><span className="block h-2 w-2 rounded-full bg-bad" /></span> Stop</> : "🎙 Dictate"}
        </button>
        <button className="btn-primary flex-1" disabled={!text.trim()}
          onClick={async () => { await onSend({ type: "MESSAGE", channel: voiceUsed ? "VOICE" : "TEXT", text }); setText(""); setVoiceUsed(false); }}>
          Send update
        </button>
      </div>
      <p className="text-xs text-muted">Dictation uses your browser&apos;s voice service (needs internet + mic permission). Speak clearly; you can always type instead.</p>
    </div>
  );
}

/* ---------------- Scores ---------------- */
function ScoresForm({ cands, unit, onSend, notify }: { cands: Cand[]; unit: Unit; onSend: (b: any, f?: any[]) => Promise<void>; notify: Notify }) {
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [accredited, setAccredited] = useState("");
  const [cast, setCast] = useState("");
  const [rejected, setRejected] = useState("");
  const [confidence, setConfidence] = useState<"DECLARED" | "PERCEIVED" | "ESTIMATE">("DECLARED");
  const [signed, setSigned] = useState(false);
  const [sheet, setSheet] = useState<File | null>(null);

  function speakNumbers() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { notify("Voice isn't supported on this browser", "error"); return; }
    const rec = new SR(); rec.lang = "en-NG"; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const said = e.results[0][0].transcript.toUpperCase();
      const next = { ...votes };
      let hits = 0;
      for (const c of cands) {
        const m = said.match(new RegExp(`${c.party}\\D+(\\d+)`));
        if (m) { next[c.id] = m[1]; hits++; }
      }
      setVotes(next);
      notify(hits ? `Captured ${hits} value${hits > 1 ? "s" : ""}` : "No party numbers detected", hits ? "success" : "error");
    };
    rec.onerror = (e: any) => notify(voiceError(e?.error || "error"), "error");
    try { rec.start(); } catch { notify("Could not start voice capture", "error"); }
  }

  async function send() {
    const scores = cands.map((c) => ({ candidateId: c.id, votes: Number(votes[c.id] || 0) }));
    await onSend(
      { type: "SCORE", channel: "TEXT", confidence, sheetSigned: signed,
        accreditedVoters: accredited ? Number(accredited) : undefined,
        totalVotesCast: cast ? Number(cast) : undefined,
        rejectedBallots: rejected ? Number(rejected) : undefined,
        scores, text: `Scores (${confidence.toLowerCase()})` },
      sheet ? [{ file: sheet, kind: "RESULT_SHEET", sheetSigned: signed }] : []
    );
    setVotes({}); setAccredited(""); setCast(""); setRejected(""); setSheet(null);
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <label className="label mb-0">Votes per party</label>
        <button className="text-xs font-semibold text-accent" onClick={speakNumbers}>🎙 Speak numbers</button>
      </div>
      <div className="space-y-2">
        {cands.map((c) => (
          <div key={c.id} className="flex items-center gap-2.5">
            <PartyBadge code={c.party} color={c.color} size={30} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-sm font-bold">{c.party}</div>
              <div className="truncate text-xs text-muted">{c.name}</div>
            </div>
            <input className="input w-24 text-right text-lg font-semibold" inputMode="numeric" value={votes[c.id] || ""}
              onChange={(e) => setVotes({ ...votes, [c.id]: e.target.value })} placeholder="0" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className="label">Accredited</label><input className="input" inputMode="numeric" value={accredited} onChange={(e) => setAccredited(e.target.value)} /></div>
        <div><label className="label">Votes cast</label><input className="input" inputMode="numeric" value={cast} onChange={(e) => setCast(e.target.value)} /></div>
        <div><label className="label">Rejected</label><input className="input" inputMode="numeric" value={rejected} onChange={(e) => setRejected(e.target.value)} /></div>
      </div>
      <div className="flex items-center gap-2">
        <select className="input flex-1" value={confidence} onChange={(e) => setConfidence(e.target.value as any)}>
          <option value="DECLARED">Declared (official)</option>
          <option value="PERCEIVED">Perceived / seen</option>
          <option value="ESTIMATE">Estimate</option>
        </select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} /> Signed sheet</label>
      </div>
      <div>
        <label className="label">Result sheet photo</label>
        <input className="input" type="file" accept="image/*" capture="environment" onChange={(e) => setSheet(e.target.files?.[0] || null)} />
      </div>
      <button className="btn-primary w-full" onClick={send}>Submit scores</button>
      {unit && <p className="text-xs text-muted">Registered voters at this unit: {unit.registeredVoters}</p>}
    </div>
  );
}

/* ---------------- Incident ---------------- */
function IncidentForm({ onSend }: { onSend: (b: any, f?: any[]) => Promise<void> }) {
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<"INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [file, setFile] = useState<File | null>(null);

  async function send() {
    await onSend({ type: "INCIDENT", channel: "TEXT", text, severity }, file ? [{ file, kind: "INCIDENT" }] : []);
    setText(""); setFile(null); setSeverity("MEDIUM");
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <label className="label">What happened?</label>
        <textarea className="input min-h-24" value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe the incident…" />
      </div>
      <div>
        <label className="label">Severity</label>
        <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as any)}>
          <option>INFO</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
        </select>
      </div>
      <div>
        <label className="label">Photo or video</label>
        <input className="input" type="file" accept="image/*,video/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>
      <button className="btn-primary w-full" disabled={!text.trim()} onClick={send}>Report incident</button>
    </div>
  );
}
