import type { Metadata } from "next";
import { db } from "@/lib/db";
import AgentLoginClient from "./AgentLoginClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve the invite code → unit so a shared link (WhatsApp, etc.) previews the
// exact LGA · Ward · Unit the code belongs to.
export async function generateMetadata({ searchParams }: { searchParams: { code?: string } }): Promise<Metadata> {
  const code = (searchParams?.code || "").trim().toUpperCase();
  let unit = "";
  if (code) {
    try {
      const a = await db.agent.findUnique({
        where: { inviteCode: code },
        include: { pollingUnit: { include: { ward: true, lga: true, state: true } } },
      });
      if (a?.pollingUnit) {
        const p = a.pollingUnit;
        unit = `${p.name} · ${p.ward.name} · ${p.lga.name}${p.state ? " · " + p.state.name : ""}`;
      }
    } catch { /* DB unreachable at build/preview — fall through to default */ }
  }
  const title = unit ? `Agent sign-in — ${unit}` : "Field Agent Sign-in — Situation Room";
  const description = unit
    ? `You've been assigned to ${unit}. Tap to sign in and send scores, incidents and updates from this polling unit.`
    : "Sign in to report from your polling unit.";
  return {
    title,
    description,
    openGraph: { title, description, siteName: "Situation Room" },
    twitter: { card: "summary", title, description },
  };
}

export default function Page() {
  return <AgentLoginClient />;
}
