import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sessionIsSuper } from "@/lib/tenant";
import { refreshPartyRegistry } from "@/lib/party-registry";

export const runtime = "nodejs";
export const maxDuration = 120;

// Super-admin: trigger the INEC party-registry refresh on demand (the same job
// the app-side monthly cron runs). Records change history automatically.
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!s || !(await sessionIsSuper(s))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const r = await refreshPartyRegistry();
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Refresh failed" }, { status: 500 });
  }
}
