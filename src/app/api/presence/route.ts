import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { presenceList, presenceCount } from "@/lib/realtime";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR", "ANALYST"]))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const totalAgents = await db.agent.count();
  return NextResponse.json({ online: presenceList(), count: presenceCount(), totalAgents });
}
