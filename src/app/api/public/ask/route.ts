import { NextRequest, NextResponse } from "next/server";
import { publicAnswer, aiEnabled } from "@/lib/ai";
import { retrieveKnowledge } from "@/lib/knowledge";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Public, unauthenticated: answers ONLY from the Electoral Act / structure and a
// product FAQ. No access to any live app data.
const FAQ = `
This platform is a parallel, independent citizen/party election-monitoring tool. Field
agents at polling units report scores, incidents and turnout in real time; a situation
room verifies and analyses them live. It is NOT the official INEC result.

It is white-labelled: a client (party, observer group, campaign) gets their own branded
instance/tenant — logo, colours, domain, candidates and constituency — and pays per
agent/user. It works for any election type (Presidential, Governorship, Senatorial,
House of Reps, State Assembly, LG Chairman, Councillor) because the polling structure is
the same; only the constituency, candidates and win-rule change.

Live results and field data are only visible to signed-in staff inside the situation room.
`.trim();

export async function POST(req: NextRequest) {
  if (!aiEnabled) return NextResponse.json({ answer: "AI is not configured yet." });
  // Per-IP (10/min) + a global soft cap (40/min) to bound AI cost.
  if (!rateLimit(`ask:${clientIp(req)}`, 10, 60_000) || !rateLimit("ask:_global", 40, 60_000))
    return NextResponse.json({ answer: "The assistant is busy right now — please try again in a moment." });

  const { question, history } = await req.json();
  const q = String(question || "").slice(0, 800).trim();
  if (!q) return NextResponse.json({ error: "Question required." }, { status: 400 });

  const knowledge = await retrieveKnowledge(q, 6);
  const answer = await publicAnswer({
    question: q,
    history: Array.isArray(history) ? history.slice(-6) : [],
    knowledge,
    faq: FAQ,
  });
  return NextResponse.json({ answer });
}
