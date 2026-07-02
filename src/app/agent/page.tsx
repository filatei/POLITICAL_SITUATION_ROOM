"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { api, clearAuth, getToken } from "@/lib/session";
import { compressImage } from "@/lib/media";
import { enqueue, count, onOutboxChange, drain, type OutboxMedia } from "@/lib/outbox";
import { getSocket } from "@/lib/socket";

type Instr = { receiptId: string; id: string; title?: string; body: string; severity: string; status: string; createdAt: string };
type Cand = { id: string; name: string; party: string; partyName: string; color: string };
type Unit = { id: string; name: string; label: string; registeredVoters: number } | null;
type Mode = "update" | "scores" | "incident";

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
  const [toast, setToast] = useState("");
  const [instructions, setInstructions] = useState<Instr[]>([]);

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

  // Realtime: receive instructions from the situation room + presence heartbeat.
  useEffect(() => {
    if (!getToken()) return;
    api("/api/instructions").then(async (r) => { if (r.ok) setInstructions((await r.json()).instructions || []); });
    const sock = getSocket();
    const onInstr = (m: Instr) => {
      setInstructions((prev) => (prev.some((x) => x.receiptId === m.receiptId) ? prev : [{ ...m, status: "DELIVERED" }, ...prev]));
      sock.emit("instruction:ack", { receiptId: m.receiptId });
      flash("New instruction from situation room");
    };
    sock.on("instruction", onInstr);
    const hb = setInterval(() => sock.emit("presence"), 25000);
    return () => { sock.off("instruction", onInstr); clearInterval(hb); };
  }, []); // eslint-disable-line

  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

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
    await enqueue({
      clientUid: uuid(),
      body: { ...body, ...geo, capturedAt: new Date().toISOString() },
      media, createdAt: Date.now(), tries: 0,
    });
    flash(online ? "Sent" : "Queued — will send when online");
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">{election?.name || "Loading…"}</div>
            <div className="font-semibold">{unit?.name || "—"}</div>
            <div className="text-xs text-muted">{unit?.label}</div>
          </div>
          <button className="text-xs text-muted underline" onClick={() => { clearAuth(); router.replace("/agent/login"); }}>Sign out</button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className={`pill ${online ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>{online ? "● Online" : "● Offline"}</span>
          {queued > 0 && <span className="pill bg-panel text-ink">{queued} queued</span>}
          {queued > 0 && online && <button className="text-accent underline" onClick={() => drain()}>Sync now</button>}
        </div>
      </header>

      {instructions.filter((i) => i.status !== "READ").length > 0 && (
        <div className="mb-4 space-y-2">
          {instructions.filter((i) => i.status !== "READ").map((it) => (
            <div key={it.receiptId} className={`card p-3 ${it.severity === "CRITICAL" || it.severity === "HIGH" ? "border-bad" : "border-accent"}`}>
              <div className="flex items-center justify-between">
                <span className={`pill ${it.severity === "CRITICAL" || it.severity === "HIGH" ? "bg-bad/15 text-bad" : "bg-accent/10 text-accent"}`}>Instruction · {it.severity}</span>
                <button className="text-xs text-accent underline" onClick={() => markRead(it)}>Mark read</button>
              </div>
              {it.title && <div className="mt-1 font-medium">{it.title}</div>}
              <div className="mt-1 text-sm">{it.body}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-line bg-black/30 p-1 text-sm">
        {(["update", "scores", "incident"] as Mode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`rounded-lg px-2 py-2 font-semibold capitalize transition ${mode === m ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/40" : "text-muted hover:text-ink"}`}>{m}</button>
        ))}
      </div>

      {mode === "update" && <UpdateForm onSend={submit} />}
      {mode === "scores" && <ScoresForm cands={cands} unit={unit} onSend={submit} />}
      {mode === "incident" && <IncidentForm onSend={submit} />}

      {toast && <div className="fixed inset-x-0 bottom-6 mx-auto w-fit rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/30">{toast}</div>}
    </main>
  );
}

/* ---------------- Update (message + voice) ---------------- */
function UpdateForm({ onSend }: { onSend: (b: any, f?: any[]) => Promise<void> }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceUsed, setVoiceUsed] = useState(false);
  const recRef = useRef<any>(null);

  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice-to-text not supported on this browser."); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = "en-NG"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e: any) => {
      let s = "";
      for (let i = e.resultIndex; i < e.results.length; i++) s += e.results[i][0].transcript;
      setText((prev) => (prev ? prev + " " : "") + s.trim());
      setVoiceUsed(true);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  }

  return (
    <div className="card space-y-3 p-4">
      <label className="label">Message to the situation room</label>
      <textarea className="input min-h-28" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or dictate an update…" />
      <div className="flex gap-2">
        <button className={`btn-ghost ${listening ? "border-bad text-bad" : ""}`} onClick={toggleVoice}>
          {listening ? "● Stop dictation" : "🎙 Dictate"}
        </button>
        <button className="btn-primary flex-1" disabled={!text.trim()}
          onClick={async () => { await onSend({ type: "MESSAGE", channel: voiceUsed ? "VOICE" : "TEXT", text }); setText(""); setVoiceUsed(false); }}>
          Send update
        </button>
      </div>
      <p className="text-xs text-muted">Dictation is transcribed on your device and works offline for text.</p>
    </div>
  );
}

/* ---------------- Scores ---------------- */
function ScoresForm({ cands, unit, onSend }: { cands: Cand[]; unit: Unit; onSend: (b: any, f?: any[]) => Promise<void> }) {
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [accredited, setAccredited] = useState("");
  const [cast, setCast] = useState("");
  const [rejected, setRejected] = useState("");
  const [confidence, setConfidence] = useState<"DECLARED" | "PERCEIVED" | "ESTIMATE">("DECLARED");
  const [signed, setSigned] = useState(false);
  const [sheet, setSheet] = useState<File | null>(null);

  function speakNumbers() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice not supported."); return; }
    const rec = new SR(); rec.lang = "en-NG"; rec.interimResults = false;
    rec.onresult = (e: any) => {
      const said = e.results[0][0].transcript.toUpperCase();
      const next = { ...votes };
      for (const c of cands) {
        const m = said.match(new RegExp(`${c.party}\\D+(\\d+)`));
        if (m) next[c.id] = m[1];
      }
      setVotes(next);
    };
    rec.start();
  }

  async function send() {
    const scores = cands.map((c) => ({ candidateId: c.id, votes: Number(votes[c.id] || 0) }));
    await onSend(
      {
        type: "SCORE", channel: "TEXT",
        confidence, sheetSigned: signed,
        accreditedVoters: accredited ? Number(accredited) : undefined,
        totalVotesCast: cast ? Number(cast) : undefined,
        rejectedBallots: rejected ? Number(rejected) : undefined,
        scores,
        text: `Scores (${confidence.toLowerCase()})`,
      },
      sheet ? [{ file: sheet, kind: "RESULT_SHEET", sheetSigned: signed }] : []
    );
    setVotes({}); setAccredited(""); setCast(""); setRejected(""); setSheet(null);
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <label className="label mb-0">Votes per party</label>
        <button className="text-xs text-accent underline" onClick={speakNumbers}>🎙 Speak numbers</button>
      </div>
      <div className="space-y-2">
        {cands.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <span className="pill w-16 justify-center text-white" style={{ background: c.color }}>{c.party}</span>
            <span className="flex-1 truncate text-sm">{c.name}</span>
            <input className="input w-24 text-right" inputMode="numeric" value={votes[c.id] || ""}
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
    await onSend(
      { type: "INCIDENT", channel: "TEXT", text, severity },
      file ? [{ file, kind: "INCIDENT" }] : []
    );
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
