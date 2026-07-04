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
    orderBy: { receivedAt: "desc" }, take: 80,
    include: { agent: true, pollingUnit: true, scores: { include: { candidate: { include: { party: true } } } } },
  });

  // Aggregate a party leaderboard from VERIFIED score submissions only, plus
  // reporting coverage + incident tallies, so the model has real structure to
  // analyze rather than just a raw feed.
  const partyTotals = new Map<string, number>();
  const unitsSeen = new Set<string>();
  let scoreReports = 0, verifiedReports = 0, disputed = 0;
  const incidents: string[] = [];
  for (const r of rows) {
    if (r.pollingUnit?.id) unitsSeen.add(r.pollingUnit.id);
    if (r.type === "SCORE") {
      scoreReports++;
      const status = (r as any).scoreStatus ?? (r as any).status;
      if (status === "VERIFIED" || status === "ACCEPTED") {
        verifiedReports++;
        for (const x of r.scores) partyTotals.set(x.candidate.party.code, (partyTotals.get(x.candidate.party.code) ?? 0) + x.votes);
      }
      if (status === "DISPUTED" || status === "REJECTED") disputed++;
    } else if (r.severity && r.severity !== "INFO") {
      incidents.push(`${r.severity} @ ${r.pollingUnit?.name ?? "—"}: ${r.text ?? ""}`.trim());
    }
  }
  const leaderboard = [...partyTotals.entries()].sort((a, b) => b[1] - a[1]);
  const totalVotes = leaderboard.reduce((s, [, v]) => s + v, 0);
  const board = leaderboard.map(([code, v]) =>
    `${code}: ${v}${totalVotes ? ` (${((v / totalVotes) * 100).toFixed(1)}%)` : ""}`).join(" · ") || "no verified scores yet";

  const lines = rows.map((r) => {
    const who = r.agent?.name ?? "staff";
    const unit = r.pollingUnit?.name ?? "—";
    const status = (r as any).scoreStatus ?? (r as any).status ?? "";
    const sc = r.scores.map((x) => `${x.candidate.party.code}:${x.votes}`).join(" ");
    return `[${r.type}${r.severity ? "/" + r.severity : ""}${status ? "/" + status : ""}] ${unit} (${who}): ${r.text ?? ""} ${sc}`.trim();
  });

  const payload = [
    `VERIFIED LEADERBOARD (party: votes): ${board}`,
    `COVERAGE: ${unitsSeen.size} units reporting · ${scoreReports} score reports (${verifiedReports} verified, ${disputed} disputed/rejected)`,
    incidents.length ? `OPEN INCIDENTS:\n${incidents.slice(0, 15).join("\n")}` : "OPEN INCIDENTS: none flagged",
    `RAW FEED (most recent first):\n${lines.join("\n")}`,
  ].join("\n\n");

  const summary = await summarize(payload);
  return NextResponse.json({ summary });
}
