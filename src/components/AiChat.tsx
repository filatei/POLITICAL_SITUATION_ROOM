"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/session";

type Msg = { role: "user" | "assistant"; content: string };

// Chat panel. Signed-in staff use /api/ai/ask (Act + app guide + LIVE FIELD DATA).
// The public landing-page variant (isPublic) uses /api/public/ask which answers
// ONLY from the Electoral Act / FAQ and has NO access to app data.
export default function AiChat({ compact, isPublic, intro, suggestions }: {
  compact?: boolean; isPublic?: boolean; intro?: string; suggestions?: string[];
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const endpoint = isPublic ? "/api/public/ask" : "/api/ai/ask";

  async function send(text?: string) {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    const history = msgs.slice(-8);
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setQ(""); setBusy(true);
    try {
      const r = isPublic
        ? await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history }) })
        : await api(endpoint, { method: "POST", body: JSON.stringify({ question, history }) });
      const j = await r.json();
      setMsgs((m) => [...m, { role: "assistant", content: j.answer || j.error || "No answer." }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Network error — try again." }]);
    } finally { setBusy(false); }
  }

  const defaultSuggestions = isPublic
    ? ["What does the Electoral Act say about over-voting?", "How is a President declared the winner?", "When do party primaries hold?", "How do I file an election petition?"]
    : ["What does the Electoral Act say about over-voting?", "How does score verification work here?", "Any anomalies in the incoming scores?", "Which units haven't reported yet?"];
  const chips = suggestions || defaultSuggestions;

  return (
    <div className="flex flex-col">
      <div className={`space-y-2 overflow-y-auto pr-1 ${compact ? "max-h-72" : "max-h-[52vh]"}`}>
        {!msgs.length && (
          <div className="space-y-2">
            <p className="text-sm text-muted">{intro || "Ask about the Electoral Act, how the app works, or the live field data."}</p>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((s) => (
                <button key={s} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-ink hover:bg-accent/15" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-accent/15 text-ink" : "bg-panel text-ink"}`}>{m.content}</div>
        ))}
        {busy && <div className="max-w-[92%] rounded-xl bg-panel px-3 py-2 text-sm text-muted">Thinking…</div>}
        <div ref={endRef} />
      </div>
      <div className="mt-2 flex gap-2">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the assistant…" onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="btn-primary" disabled={busy || !q.trim()} onClick={() => send()}>{busy ? "…" : "Ask"}</button>
        {msgs.length > 0 && <button className="btn-ghost" onClick={() => setMsgs([])} title="Clear chat">Clear</button>}
      </div>
    </div>
  );
}
