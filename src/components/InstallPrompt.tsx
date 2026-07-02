"use client";
import { useEffect, useState } from "react";

// Shows an "Install app" banner when the browser offers PWA installation
// (Android/Chrome/Edge). iOS is added-to-home-screen via the Share menu.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // already installed / running standalone → never show
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || (navigator as any).standalone;
    if (standalone || localStorage.getItem("psr_install_dismissed")) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() { setShow(false); localStorage.setItem("psr_install_dismissed", "1"); }
  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    setShow(false); setDeferred(null);
  }

  if (!show) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-panel/95 p-3 shadow-2xl backdrop-blur">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" width={40} height={40} className="rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">Install Situation Room</div>
        <div className="text-xs text-muted">Add to your home screen for faster, offline-ready access.</div>
      </div>
      <button className="text-xs text-muted hover:text-ink" onClick={dismiss}>Later</button>
      <button className="btn-primary px-3 py-1.5 text-sm" onClick={install}>Install</button>
    </div>
  );
}
