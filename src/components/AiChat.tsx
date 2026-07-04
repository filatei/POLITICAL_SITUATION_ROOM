"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/session";

type Msg = { role: "user" | "assistant"; content: string };

// Minimal, safe Markdown -> HTML for assistant replies (headings, bold/italic,
// inline + fenced code, links, bullet/numbered lists). HTML is escaped first, so
// the model can't inject markup.
function renderMarkdown(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1 py-0.5 text-[0.85em]">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/\b(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer" class="text-accent underline">$1</a>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-accent underline">$1</a>');
  const lines = src.replace(/\r/g, "").split("\n");
  let html = "", list: "ul" | "ol" | null = null, code = false, buf: string[] = [];
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const flushP = () => { if (buf.length) { html += `<p class="my-1">${buf.map(inline).join("<br/>")}</p>`; buf = []; } };
  for (const raw of lines) {
    const line = raw;
    if (/^```/.test(line.trim())) {
      if (!code) { flushP(); closeList(); code = true; html += '<pre class="my-1.5 overflow-x-auto rounded-lg bg-white/10 p-2 text-[0.8em]"><code>'; }
      else { code = false; html += "</code></pre>"; }
      continue;
    }
    if (code) { html += esc(line) + "\n"; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flushP(); closeList(); const n = h[1].length; html += `<div class="mt-2 mb-0.5 font-bold ${n <= 2 ? "text-[1.05em]" : ""}">${inline(h[2])}</div>`; continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul) { flushP(); if (list !== "ul") { closeList(); html += '<ul class="my-1 list-disc pl-5 space-y-0.5">'; list = "ul"; } html += `<li>${inline(ul[1])}</li>`; continue; }
    if (ol) { flushP(); if (list !== "ol") { closeList(); html += '<ol class="my-1 list-decimal pl-5 space-y-0.5">'; list = "ol"; } html += `<li>${inline(ol[1])}</li>`; continue; }
    if (!line.trim()) { flushP(); closeList(); continue; }
    buf.push(line);
  }
  flushP(); closeList(); if (code) html += "</code></pre>";
  return html;
}

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
          m.role === "assistant"
            ? <div key={i} className="max-w-[92%] rounded-xl bg-panel px-3 py-2 text-sm leading-relaxed text-ink [&_a]:break-words" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
            : <div key={i} className="ml-auto max-w-[92%] whitespace-pre-wrap rounded-xl bg-accent/15 px-3 py-2 text-sm text-ink">{m.content}</div>
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
