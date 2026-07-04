"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { saveAuth } from "@/lib/session";
import { tenantFromPath } from "@/lib/tenant-path";

type Tab = "invite" | "google";
type Phase = "form" | "signing" | "done";

export default function AgentLoginClient() {
  const router = useRouter();
  const pathname = usePathname();
  const { base } = tenantFromPath(pathname);
  useEffect(() => {
    // A bare /agent/login (no tenant slug) isn't a valid entry — send to landing.
    if (pathname.replace(/\/+$/, "") === "/agent/login") router.replace("/");
  }, [pathname, router]);
  const [tab, setTab] = useState<Tab>("invite");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [who, setWho] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const autoTried = useRef(false);

  async function post(path: string, body: any) {
    setBusy(true); setErr("");
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error?.formErrors?.[0] || j.error || "Failed");
      return j;
    } catch (e: any) { setErr(String(e.message || e)); return null; }
    finally { setBusy(false); }
  }

  // A pleasant hand-off: brief "signing in" → "you're in" → app.
  async function finish(j: any) {
    saveAuth(j.token, j.session, j.unit);
    setWho(j.session?.name || j.unit?.name || "agent");
    setPhase("done");
    setTimeout(() => router.push(`${base}/agent`), 950);
  }

  async function doInvite(codeArg?: string) {
    const code = (codeArg ?? inviteCode).trim();
    if (!code) return;
    setPhase("signing");
    const j = await post("/api/auth/agent-invite", { inviteCode: code });
    if (j) await finish(j);
    else setPhase("form");
  }

  // Arriving from a QR / invite link (?code=OND-XXXX): sign in automatically —
  // no login screen, just the animated hand-off.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("code");
    if (c && !autoTried.current) { autoTried.current = true; const up = c.trim().toUpperCase(); setInviteCode(up); doInvite(up); }
  }, []); // eslint-disable-line

  // Google Identity Services (for pre-profiled agents + staff)
  useEffect(() => {
    if (tab !== "google" || phase !== "form") return;
    const cid = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!cid) { setErr("Google not configured."); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => {
      const g = (window as any).google;
      if (!g) return;
      g.accounts.id.initialize({
        client_id: cid,
        callback: async (resp: any) => {
          setPhase("signing");
          const j = await post("/api/auth/google", { credential: resp.credential });
          if (j) await finish(j); else setPhase("form");
        },
      });
      const el = document.getElementById("gbtn");
      if (el) g.accounts.id.renderButton(el, { theme: "filled_blue", size: "large", shape: "pill", width: 300 });
    };
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, [tab, phase]); // eslint-disable-line

  if (phase !== "form") {
    const done = phase === "done";
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="fade-in flex flex-col items-center gap-5 text-center">
          <div className={`grid h-24 w-24 place-items-center rounded-full ${done ? "bg-good/15" : "bg-accent/10"}`}>
            {done
              ? <span className="pop-in text-5xl text-good">✓</span>
              : <span className="block h-12 w-12 animate-spin rounded-full border-[3px] border-accent/25 border-t-accent" />}
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight">{done ? "You're in" : "Signing you in…"}</div>
            <div className="mt-1 text-sm text-muted">{done ? `Welcome${who ? `, ${who}` : ""}` : "Preparing your polling-unit workspace"}</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Field Agent Sign-in</h1>
        <p className="mt-1 text-sm text-muted">Sign in to report from your polling unit.</p>
      </div>

      <div className="flex gap-1 rounded-xl border border-line bg-black/30 p-1 text-sm">
        {(["invite", "google"] as Tab[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); setErr(""); }}
            className={`flex-1 rounded-lg px-3 py-2 font-semibold transition ${tab === t ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/40" : "text-muted hover:text-ink"}`}>
            {t === "invite" ? "Invite code" : "Google"}
          </button>
        ))}
      </div>

      {err && <div className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{err}</div>}

      {tab === "invite" && (
        <div className="card space-y-3 p-5">
          <div>
            <label className="label">Invite code</label>
            <input className="input uppercase" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="OND-XXXXX" autoFocus />
          </div>
          <button className="btn-primary w-full" disabled={busy || !inviteCode.trim()} onClick={() => doInvite()}>Sign in</button>
          <p className="text-center text-xs text-muted">Just enter your code — no password needed.</p>
        </div>
      )}

      {tab === "google" && (
        <div className="card flex flex-col items-center gap-3 p-5">
          <p className="text-center text-sm text-muted">Use the Google account an admin enrolled for you.</p>
          <div id="gbtn" />
        </div>
      )}
    </main>
  );
}
