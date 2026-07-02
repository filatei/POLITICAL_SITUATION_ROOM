import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!s || s.kind !== "agent") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { currentPin, newPin } = await req.json();
  if (!newPin || String(newPin).length < 4) return NextResponse.json({ error: "New PIN must be at least 4 digits." }, { status: 400 });

  const agent = await db.agent.findUnique({ where: { id: s.sub } });
  if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  if (agent.pinHash && !(await bcrypt.compare(String(currentPin || ""), agent.pinHash)))
    return NextResponse.json({ error: "Current PIN is incorrect." }, { status: 401 });

  await db.agent.update({ where: { id: agent.id }, data: { pinHash: await bcrypt.hash(String(newPin), 10) } });
  return NextResponse.json({ ok: true });
}
