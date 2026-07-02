import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { analyzeQuestion, aiEnabled } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR", "ANALYST"]))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!aiEnabled) return NextResponse.json({ answer: "AI not configured (set ANTHROPIC_API_KEY)." });

  const { question } = await req.json();
  if (!question) return NextResponse.json({ error: "Question required." }, { status: 400 });

  const rows = await db.submission.findMany({
    orderBy: { receivedAt: "desc" }, take: 80,
    include: { agent: true, pollingUnit: { include: { ward: true, lga: true } }, scores: { include: { candidate: { include: { party: true } } } } },
  });
  const ctx = rows.map((r) => {
    const unit = r.pollingUnit ? `${r.pollingUnit.name}/${r.pollingUnit.ward.name}/${r.pollingUnit.lga.name}` : "—";
    const sc = r.scores.map((x) => `${x.candidate.party.code}=${x.votes}`).join(",");
    return `${r.receivedAt.toISOString()} ${r.type} ${r.scoreStatus} @${unit} ${r.confidence ?? ""} ${r.text ?? ""} ${sc}`.trim();
  }).join("\n");

  const answer = await analyzeQuestion(String(question), ctx);
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "ai:ask", entity: "AI", meta: { question } } });
  return NextResponse.json({ answer });
}
