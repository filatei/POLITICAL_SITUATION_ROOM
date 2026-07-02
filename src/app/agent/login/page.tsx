"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveAuth } from "@/lib/session";

type Tab = "invite" | "otp" | "google";

export default function AgentLogin() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("invite");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // invite
  const [inviteCode, setInviteCode] = useState("");

  // Prefill the invite code from a scanned QR link: /agent/login?code=OND-XXXXX
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("code");
    if (c) { setInviteCode(c.trim().toUpperCase()); setTab("invite"); }
  }, []);
  // otp
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");

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

  async function doInvite() {
    const j = await post("/api/auth/agent-invite", { inviteCode });
    if (j) { saveAuth(j.token, j.session, j.unit); router.push("/agent"); }
  }
  async function reqOtp() { const j = await post("/api/auth/otp/request", { phone }); if (j) setOtpSent(true); }
  async function verifyOtp() {
    const j = await post("/api/auth/otp/verify", { phone, code });
    if (j) { saveAuth(j.token, j.session, j.unit); router.push("/agent"); }
  }

  // Google Identity Services
  useEffect(() => {
    if (tab !== "google") return;
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
          const j = await post("/api/auth/google", { credential: resp.credential });
          if (j) { saveAuth(j.token, j.session, j.unit); router.push("/agent"); }
        },
      });
      const el = document.getElementById("gbtn");
      if (el) g.accounts.id.renderButton(el, { theme: "filled_blue", size: "large", shape: "pill", width: 300 });
    };
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, [tab]); // eslint-disable-line

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Field Agent Sign-in</h1>
        <p className="mt-1 text-sm text-muted">Sign in to report from your polling unit.</p>
      </div>

      <div className="flex gap-1 rounded-xl border border-line bg-black/30 p-1 text-sm">
        {(["invite", "otp", "google"] as Tab[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); setErr(""); }}
            className={`flex-1 rounded-lg px-3 py-2 font-semibold transition ${tab === t ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/40" : "text-muted hover:text-ink"}`}>
            {t === "invite" ? "Invite + PIN" : t === "otp" ? "Phone OTP" : "Google"}
          </button>
        ))}
      </div>

      {err && <div className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{err}</div>}

      {tab === "invite" && (
        <div className="card space-y-3 p-5">
          <div>
            <label className="label">Invite code</label>
            <input className="input uppercase" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="FIELD-1001" autoFocus />
          </div>
          <button className="btn-primary w-full" disabled={busy || !inviteCode.trim()} onClick={doInvite}>Sign in</button>
          <p className="text-center text-xs text-muted">Just enter your code — no password needed.</p>
        </div>
      )}

      {tab === "otp" && (
        <div className="card space-y-3 p-5">
          <div>
            <label className="label">Phone number</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="080..." />
          </div>
          {otpSent && (
            <div>
              <label className="label">Enter the 6-digit code</label>
              <input className="input tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456" />
            </div>
          )}
          {!otpSent
            ? <button className="btn-primary w-full" disabled={busy} onClick={reqOtp}>Send code</button>
            : <button className="btn-primary w-full" disabled={busy} onClick={verifyOtp}>Verify & sign in</button>}
        </div>
      )}

      {tab === "google" && (
        <div className="card flex flex-col items-center gap-3 p-5">
          <p className="text-sm text-muted">For staff / coordinators with an authorized Google account.</p>
          <div id="gbtn" />
        </div>
      )}
    </main>
  );
}
