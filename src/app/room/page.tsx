"use client";
import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/session";
import RoomLogin from "@/components/RoomLogin";
import Dashboard from "@/components/Dashboard";
import RootTenantGate from "@/components/RootTenantGate";
import type { Session } from "@/lib/auth";

export default function RoomPage() {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");
  const [session, setSession] = useState<Session | null>(null);

  async function check() {
    const r = await api("/api/auth/me");
    if (r.ok) { const j = await r.json(); setSession(j.session); setState("in"); }
    else setState("out");
  }
  useEffect(() => { check(); }, []);

  if (state === "loading") return <main className="grid min-h-dvh place-items-center text-muted">Loading…</main>;
  if (state === "out") return <RoomLogin onDone={check} />;
  // Bare /room is reserved for super-admins; tenant admins are routed to their
  // own room slug (or pick, if they own several).
  const bareRoot = typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === "/room";
  if (bareRoot) return <RootTenantGate base="room"><Dashboard session={session!} /></RootTenantGate>;
  return <Dashboard session={session!} />;
}
