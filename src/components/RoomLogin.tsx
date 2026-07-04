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
            <p className="text-center text-[11px] text-muted">Access is by Google Sign-In only. Use the email your room was created with, or the one your admin invited.</p>
          </>
        ) : (
          <p className="text-center text-sm text-muted">Google Sign-In isn’t configured for this deployment. Set <span className="tabular">NEXT_PUBLIC_GOOGLE_CLIENT_ID</span> and rebuild.</p>
        )}
      </div>
    </main>
  );
}
