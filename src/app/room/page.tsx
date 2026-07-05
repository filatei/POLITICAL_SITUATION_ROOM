"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/session";
import RoomLogin from "@/components/RoomLogin";
import Dashboard from "@/components/Dashboard";
import type { Session } from "@/lib/auth";

export default function RoomPage() {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");
  const [session, setSession] = useState<Session | null>(null);
  // Bare /room is not a valid entry — rooms live under a tenant slug
  // (/{slug}/room). Send stray visitors to the landing page.
  const bareRoot = typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === "/room";

  async function check() {
    const r = await api("/api/auth/me");
    if (r.ok) {
      const j = await r.json();
      // The situation room is staff-only. Field agents get bounced to their own
      // reporting page (under their tenant slug) instead of seeing the full room.
      if (j.session?.kind === "agent") {
        const parts = window.location.pathname.split("/").filter(Boolean);
        const slug = parts[1] === "room" ? parts[0] : "";
        window.location.replace(slug ? `/${slug}/agent` : "/");
        return;
      }
      setSession(j.session); setState("in");
    } else setState("out");
  }
  useEffect(() => {
    if (bareRoot) { window.location.replace("/"); return; }
    check();
  }, []); // eslint-disable-line

  if (bareRoot) return null;
  if (state === "loading") return <main className="grid min-h-dvh place-items-center text-muted">Loading…</main>;
  if (state === "out") return <RoomLogin onDone={check} />;
  return <Dashboard session={session!} />;
}
