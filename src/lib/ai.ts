import Anthropic from "@anthropic-ai/sdk";

const key = process.env.ANTHROPIC_API_KEY;
const model = process.env.AI_MODEL || "claude-sonnet-4-6";
const client = key ? new Anthropic({ apiKey: key }) : null;

export const aiEnabled = !!client;

async function ask(system: string, user: string, maxTokens = 1024): Promise<string> {
  if (!client) return "AI is not configured (set ANTHROPIC_API_KEY).";
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function summarize(payload: string) {
  return ask(
    "You are an election situation-room analyst. Summarize the incoming field reports crisply for a big screen: key incidents, notable score movements, and anything needing attention. Use short bullet lines. Be factual and neutral.",
    payload,
    900
  );
}

export function triageIncident(text: string) {
  return ask(
    "Classify this election-day field incident. Return one line: SEVERITY (INFO/LOW/MEDIUM/HIGH/CRITICAL) - short category - one-sentence reason. Be conservative; violence, voter suppression, and ballot tampering are HIGH/CRITICAL.",
    text,
    200
  );
}

export function analyzeQuestion(question: string, context: string) {
  return ask(
    "You are an election data analyst. Answer the question using ONLY the provided situation-room data context. Cite polling units by name where relevant. If the data is insufficient, say so. Never invent numbers.",
    `DATA CONTEXT:\n${context}\n\nQUESTION: ${question}`,
    1200
  );
}

// The full situation-room assistant: grounded in (a) Electoral Act / structure
// knowledge, (b) an app guide, and (c) live field data. Supports multi-turn chat.
export async function assistantAnswer(opts: {
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
  appGuide: string;
  knowledge: { source: string; section?: string; title: string; content: string }[];
  data: string;
}): Promise<string> {
  if (!client) return "AI is not configured (set ANTHROPIC_API_KEY).";
  const kb = opts.knowledge.length
    ? opts.knowledge.map((k) => `[${k.source}${k.section ? " · " + k.section : ""}] ${k.title}\n${k.content}`).join("\n\n")
    : "(no matching knowledge-base entries)";

  const system = [
    "You are the assistant inside an election Situation Room app. You help staff and coordinators with three kinds of questions:",
    "1) NIGERIAN ELECTORAL LAW & STRUCTURE — answer using the KNOWLEDGE BASE excerpts. Quote the section where given. If the base lacks it, say the full Electoral Act text hasn't been loaded and answer only from what's provided; never fabricate section numbers or provisions.",
    "2) HOW THIS APP WORKS — answer using the APP GUIDE.",
    "3) ANALYSIS OF FIELD DATA — answer using the LIVE DATA (agent reports, scores, incidents). Cite polling units by name; never invent numbers; flag anomalies (e.g. votes exceeding turnout).",
    "Be concise, factual and neutral. This platform is a parallel citizen/party count, not the official INEC result — say so if asked about official outcomes.",
  ].join("\n");

  const grounding = `APP GUIDE:\n${opts.appGuide}\n\nKNOWLEDGE BASE:\n${kb}\n\nLIVE FIELD DATA (recent):\n${opts.data}`;

  const messages: Anthropic.MessageParam[] = [];
  for (const h of (opts.history || []).slice(-8)) messages.push({ role: h.role, content: h.content });
  messages.push({ role: "user", content: `${grounding}\n\n---\nQUESTION: ${opts.question}` });

  const res = await client.messages.create({ model, max_tokens: 1200, system, messages });
  return res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}

// PUBLIC assistant for the landing page. Answers ONLY from the Electoral Act /
// structure knowledge + a general product FAQ. Has NO access to live app data.
export async function publicAnswer(opts: {
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
  knowledge: { source: string; section?: string; title: string; content: string }[];
  faq: string;
}): Promise<string> {
  if (!client) return "AI is not configured.";
  const kb = opts.knowledge.length
    ? opts.knowledge.map((k) => `[${k.source}${k.section ? " · " + k.section : ""}] ${k.title}\n${k.content}`).join("\n\n")
    : "(no matching Act entries loaded)";

  const system = [
    "You are a public assistant on the landing page of an election-monitoring platform.",
    "You may ONLY answer: (1) questions about the Nigerian Electoral Act and electoral structure, using the KNOWLEDGE BASE; and (2) general FAQ about what this platform is/does, using the PRODUCT FAQ.",
    "You have NO access to any live election data, agent reports, scores or results. If asked about specific live figures/results, reply that live data is only available to signed-in staff inside the situation room.",
    "Never fabricate legal provisions or section numbers. If the knowledge base doesn't contain the answer, say the full Act text may not be loaded and answer only from what's provided. Be concise, neutral and non-partisan.",
  ].join("\n");

  const grounding = `PRODUCT FAQ:\n${opts.faq}\n\nKNOWLEDGE BASE (Electoral Act & structure):\n${kb}`;
  const messages: Anthropic.MessageParam[] = [];
  for (const h of (opts.history || []).slice(-6)) messages.push({ role: h.role, content: h.content });
  messages.push({ role: "user", content: `${grounding}\n\n---\nQUESTION: ${opts.question}` });

  const res = await client.messages.create({ model, max_tokens: 1000, system, messages });
  return res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}
