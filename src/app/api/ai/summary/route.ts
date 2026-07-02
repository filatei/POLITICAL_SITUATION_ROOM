import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { summarize, aiEnabled } from "@/lib/ai";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR", "ANALYST"]))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!aiEnabled) return NextResponse.json({ summary: "AI not configured (set ANTHROPIC_API_KEY)." });

  const rows = await db.submission.findMany({
    orderBy: { receivedAt: "desc" }, take: 50,
    include: { agent: true, pollingUnit: true, scores: { include: { candidate: { include: { party: true } } } } },
  });
  const lines = rows.map((r) => {
    const who = r.agent?.name ?? "staff";
    const unit = r.pollingUnit?.name ?? "—";
    const sc = r.scores.map((x) => `${x.candidate.party.code}:${x.votes}`).join(" ");
    return `[${r.type}${r.severity ? "/" + r.severity : ""}] ${unit} (${who}): ${r.text ?? ""} ${sc}`.trim();
  });
  const summary = await summarize(lines.join("\n"));
  return NextResponse.json({ summary });
}
