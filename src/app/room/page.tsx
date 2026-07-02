"use client";
import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/session";
import RoomLogin from "@/components/RoomLogin";
import Dashboard from "@/components/Dashboard";
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
  return <Dashboard session={session!} />;
}
