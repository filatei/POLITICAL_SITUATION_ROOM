"use client";
import { useEffect } from "react";

// Registers the service worker and keeps the installed PWA current: it checks
// for a new build on open and on refocus, activates it, and reloads once so the
// user always sees the latest version without manual cache-clearing.
export default function SWRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let reg: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker.register("/sw.js").then((r) => {
      reg = r;
      r.update().catch(() => {});
      r.addEventListener("updatefound", () => {
        const nw = r.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          // New SW installed while a controller is active => it's an update.
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            nw.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    }).catch(() => {});

    // Re-check for a newer build whenever the app is reopened / refocused.
    const onVis = () => { if (document.visibilityState === "visible") reg?.update().catch(() => {}); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return null;
}
