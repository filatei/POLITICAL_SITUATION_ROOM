"use client";
import { useState } from "react";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function send() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/public/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, message }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setDone(true); setName(""); setEmail(""); setMessage("");
    } catch (e: any) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  }

  if (done) return (
    <div className="card p-6 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-good/15 text-3xl text-good">✓</div>
      <div className="mt-3 font-semibold">Thanks — message received</div>
      <p className="mt-1 text-sm text-muted">We'll get back to you at the email you provided.</p>
      <button className="btn-ghost mt-4" onClick={() => setDone(false)}>Send another</button>
    </div>
  );

  return (
    <div className="card p-5">
      {err && <div className="mb-3 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{err}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
        <div><label className="label">Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="you@example.com" /></div>
      </div>
      <div className="mt-3"><label className="label">Message</label><textarea className="input min-h-28" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us about your election / tenancy needs…" /></div>
      <button className="btn-primary mt-3 w-full sm:w-auto" disabled={busy || !name.trim() || !email.trim() || !message.trim()} onClick={send}>{busy ? "Sending…" : "Send message"}</button>
    </div>
  );
}
