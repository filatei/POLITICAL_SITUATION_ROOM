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
