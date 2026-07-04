import { scopedElection } from "@/lib/election-scope";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { assistantAnswer, aiEnabled } from "@/lib/ai";
import { APP_GUIDE, retrieveKnowledge } from "@/lib/knowledge";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR", "ANALYST"]))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!aiEnabled) return NextResponse.json({ answer: "AI not configured (set ANTHROPIC_API_KEY)." });

  const { question, history } = await req.json();
  if (!question) return NextResponse.json({ error: "Question required." }, { status: 400 });

  // Live field data context (recent submissions + a headline tally) — scoped to
  // the caller's own election so the assistant never sees another tenant's data.
  const election = await scopedElection();
  const rows = await db.submission.findMany({
    where: election ? { electionId: election.id } : {},
    orderBy: { receivedAt: "desc" }, take: 80,
    include: { agent: true, pollingUnit: { include: { ward: true, lga: true } }, scores: { include: { candidate: { include: { party: true } } } } },
  });
  const dataCtx = [
    election ? `ELECTION: ${election.name} (${election.type})` : "",
    ...rows.map((r) => {
      const unit = r.pollingUnit ? `${r.pollingUnit.name}/${r.pollingUnit.ward.name}/${r.pollingUnit.lga.name}` : "—";
      const sc = r.scores.map((x) => `${x.candidate.party.code}=${x.votes}`).join(",");
      const geo = r.lat != null && r.lng != null ? `@${r.lat.toFixed(4)},${r.lng.toFixed(4)}` : "";
      return `${r.receivedAt.toISOString()} ${r.type} ${r.scoreStatus} unit:${unit} by:${r.agent?.name ?? "—"} ${geo} ${r.confidence ?? ""} ${r.text ?? ""} ${sc}`.trim();
    }),
  ].filter(Boolean).join("\n");

  const knowledge = await retrieveKnowledge(String(question), 6);

  const answer = await assistantAnswer({
    question: String(question),
    history: Array.isArray(history) ? history.slice(-8) : [],
    appGuide: APP_GUIDE,
    knowledge,
    data: dataCtx,
  });

  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "ai:ask", entity: "AI", meta: { question } } });
  return NextResponse.json({ answer, usedKnowledge: knowledge.map((k) => `${k.source}${k.section ? " · " + k.section : ""}`) });
}
