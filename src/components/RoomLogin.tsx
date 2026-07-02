"use client";
import { useEffect, useState } from "react";
import { saveAuth } from "@/lib/session";

export default function RoomLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function login() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Login failed");
      saveAuth(j.token, j.session);
      onDone();
    } catch (e: any) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const cid = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!cid) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => {
      const g = (window as any).google; if (!g) return;
      g.accounts.id.initialize({
        client_id: cid,
        callback: async (resp: any) => {
          const r = await fetch("/api/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: resp.credential }) });
          const j = await r.json();
          if (r.ok) { saveAuth(j.token, j.session); onDone(); } else setErr(j.error || "Google failed");
        },
      });
      const el = document.getElementById("gbtn2"); if (el) g.accounts.id.renderButton(el, { theme: "outline", size: "large" });
    };
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, []); // eslint-disable-line

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Situation Room</h1>
        <p className="mt-1 text-sm text-muted">Staff sign-in.</p>
      </div>
      {err && <div className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{err}</div>}
      <div className="card space-y-3 p-5">
        <div><label className="label">Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label">Password</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn-primary w-full" disabled={busy} onClick={login}>Sign in</button>
        <div className="flex justify-center pt-1" id="gbtn2" />
      </div>
    </main>
  );
}
