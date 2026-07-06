"use client";
import { useEffect, useState } from "react";
import { saveAuth } from "@/lib/session";

// Google-only sign-in. There is no email/password form — access is granted
// solely via Google Sign-In, and only to accounts the tenant admin has been
// enrolled/invited under (the creator's Google email becomes the admin).
export default function RoomLogin({ onDone }: { onDone: () => void }) {
  const [err, setErr] = useState("");
  const cid = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!cid) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => {
      const g = (window as any).google; if (!g) return;
      g.accounts.id.initialize({
        client_id: cid,
        callback: async (resp: any) => {
          try {
            const r = await fetch("/api/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: resp.credential }) });
            const j = await r.json();
            if (r.ok) { saveAuth(j.token, j.session); onDone(); }
            else setErr(j.error || "This Google account isn’t authorised for this room.");
          } catch { setErr("Sign-in failed. Please try again."); }
        },
      });
      const el = document.getElementById("gbtn"); if (el) g.accounts.id.renderButton(el, { theme: "filled_blue", size: "large", shape: "pill", width: 280 });
      g.accounts.id.prompt();
    };
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, [cid, onDone]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/psr-logo.png" alt="PSR" className="h-14 w-auto" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Situation Room</h1>
          <p className="mt-1 text-sm text-muted">Sign in with your Google account to continue.</p>
        </div>
      </div>

      {err && <div className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-center text-sm text-bad">{err}</div>}

      <div className="card flex flex-col items-center gap-4 p-6">
        {cid ? (
          <>
            <div id="gbtn" className="flex justify-center" />
            <p className="text-center text-[11px] text-muted">Use the email your room was created with, or the one your admin invited.</p>
          </>
        ) : (
          <p className="text-center text-sm text-muted">Google Sign-In isn’t configured for this deployment.</p>
        )}

        <div className="flex w-full items-center gap-3 text-[11px] text-muted"><span className="h-px flex-1 bg-line" />OR<span className="h-px flex-1 bg-line" /></div>
        <WhatsAppLogin onDone={onDone} onError={setErr} />
        <p className="text-center text-[11px] text-muted">Admins can sign in with a code sent to their phone (WhatsApp + SMS).</p>
      </div>
    </main>
  );
}

// When set, admin phone login routes through the central Torama Auth service
// (via PSR's own /api/auth/torama/* proxy) instead of PSR's built-in OTP.
const USE_TORAMA_AUTH = process.env.NEXT_PUBLIC_TORAMA_AUTH === "1";

function psrDeviceId(): string {
  try {
    let id = localStorage.getItem("psr_device_id");
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `dev-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("psr_device_id", id);
    }
    return id;
  } catch { return `dev-${Date.now().toString(36)}`; }
}

// Phone → WhatsApp code → verify → session. For tenant admins & super-admins.
function WhatsAppLogin({ onDone, onError }: { onDone: () => void; onError: (s: string) => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function request() {
    if (!phone.trim() || busy) return;
    setBusy(true); onError("");
    try {
      const url = USE_TORAMA_AUTH ? "/api/auth/torama/start" : "/api/auth/login-otp/request";
      const body = USE_TORAMA_AUTH ? { phone: phone.trim(), deviceId: psrDeviceId() } : { phone: phone.trim() };
      await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setStep("code"); setNote("If that number is an admin, a code is on its way via WhatsApp & SMS.");
    } catch { onError("Couldn't request a code. Try again."); }
    finally { setBusy(false); }
  }
  async function verify() {
    if (code.trim().length < 4 || busy) return;
    setBusy(true); onError("");
    try {
      const url = USE_TORAMA_AUTH ? "/api/auth/torama/verify" : "/api/auth/login-otp/verify";
      const body = USE_TORAMA_AUTH
        ? { phone: phone.trim(), code: code.trim(), deviceId: psrDeviceId() }
        : { phone: phone.trim(), code: code.trim() };
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.ok) { saveAuth(j.token, j.session); onDone(); }
      else onError(j.error || "Invalid or expired code.");
    } catch { onError("Verification failed. Try again."); }
    finally { setBusy(false); }
  }

  if (step === "phone") {
    return (
      <div className="w-full space-y-2">
        <div className="flex items-stretch overflow-hidden rounded-lg border border-line focus-within:ring-1 focus-within:ring-accent/40">
          <span className="flex shrink-0 items-center gap-1 border-r border-line bg-ink/5 px-3 text-sm text-muted">🇳🇬 +234</span>
          <input className="input flex-1 border-0 bg-transparent focus:ring-0" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="803 000 0000" onKeyDown={(e) => e.key === "Enter" && request()} />
        </div>
        <button className="btn-ghost w-full" disabled={busy || !phone.trim()} onClick={request}>{busy ? "Sending…" : "Send WhatsApp code"}</button>
      </div>
    );
  }
  return (
    <div className="w-full space-y-2">
      {note && <p className="text-center text-[11px] text-good">{note}</p>}
      <input className="input w-full text-center tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]*" placeholder="••••••" onKeyDown={(e) => e.key === "Enter" && verify()} />
      <button className="btn-primary w-full" disabled={busy || code.trim().length < 4} onClick={verify}>{busy ? "Verifying…" : "Sign in"}</button>
      <button className="w-full text-center text-[11px] text-muted underline" onClick={() => { setStep("phone"); setCode(""); setNote(""); }}>Use a different number</button>
    </div>
  );
}
