import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { emitDashboard } from "@/lib/realtime";

export const runtime = "nodejs";

// HTTP fallback for delivery/read receipts (used when the socket is down but
// the agent regained enough connectivity to POST).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession(req);
  if (!s || s.kind !== "agent") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { status } = await req.json();
  const st = ["DELIVERED", "READ", "ACK"].includes(status) ? status : "READ";

  const r = await db.instructionReceipt.updateMany({
    where: { instructionId: params.id, agentId: s.sub },
    data: { status: st, deliveredAt: new Date(), ...(st === "READ" ? { readAt: new Date() } : {}) },
  });
  if (!r.count) return NextResponse.json({ error: "No receipt." }, { status: 404 });
  emitDashboard("receipt:update", { instructionId: params.id, agentId: s.sub, status: st });
  return NextResponse.json({ ok: true, status: st });
}
