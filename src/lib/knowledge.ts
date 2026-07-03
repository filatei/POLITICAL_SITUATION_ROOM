import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";

// What the assistant should know about THIS app, so it can answer "how do I…" and
// "what does X mean" questions from staff and agents.
export const APP_GUIDE = `
SITUATION ROOM — APP GUIDE (for the AI assistant)

Purpose: a parallel, citizen/party election-monitoring platform. Field agents at
polling units send reports; a situation room sees everything live. It is NOT the
official INEC result — it is an independent parallel collation.

Roles:
- AGENT: assigned to one polling unit. Uses the agent PWA (offline-capable) to send
  scores (votes per party), messages/status updates, and incidents (with photo/video/
  voice and GPS). Signs in with an admin-issued invite code/QR or a pre-enrolled
  Google email.
- ADMIN: full control — enrol staff, generate agent codes, manage geography
  (LGA→Ward→Unit), record official results (manual tally override), verify scores.
- COORDINATOR: can verify/dispute scores, broadcast instructions, see the room.
- ANALYST: view the room and use the AI assistant.

Data model: State → LGA → Ward → Polling Unit. Every submission is stored against a
polling unit with the agent's GPS coordinates.

Scores: an agent files "declared" (from the official EC8A sheet), "perceived", or
"estimate" figures. A score is PENDING until an admin/coordinator VERIFIES it. The
room's Score Tally counts VERIFIED votes only; "declared/perceived" totals below each
party count all incoming reports regardless of verification.

Situation room (/room): three panes — Score Tally (aggregate per party), Scores by
Unit (grouped, latest bubbles up, arrival chime + splash), and Incidents & Updates.
Plus AI analysis, instruction broadcast to agents, and presence (agents online).

Admin (/admin): register agents, bulk-generate codes per unit in an LGA, Geography
drill-down (click LGA→Ward→Unit to administer and see reports there), Official Result
Override (enter a verified unit result straight from the form — audit-logged), Staff
Accounts, and clicking any code opens that agent's full activity with GPS map pins.

Result verification is the core integrity control: numbers only enter the official
tally when an admin verifies them, and every override/verify/assignment is audit-logged.
`.trim();

// Curated, high-confidence summaries of the Nigeria Electoral Act 2022 and structure.
// These are SUMMARIES for quick grounding; load the full Act text via the admin
// Knowledge importer for verbatim, section-accurate answers.
export const SEED_KNOWLEDGE: { source: string; section?: string; title: string; content: string; ord: number }[] = [
  { source: "electoral-act-2022", section: "Commencement", title: "Electoral Act — governing law", ord: 1,
    content: "Nigeria's federal, state and Area Council elections are governed by the Electoral Act. The Electoral Act 2026 repeals the Electoral Act No. 13, 2022. When the full Act text is loaded into this knowledge base, cite it as the authoritative source; the summaries here are for quick grounding only. The Act provides the legal basis for technology in accreditation (BVAS) and result management (the INEC Result Viewing portal, IReV)." },
  { source: "electoral-act-2022", section: "Accreditation (BVAS)", title: "Voter accreditation by BVAS", ord: 2,
    content: "The Act empowers INEC to determine the procedure for accreditation of voters and to use technological devices. In practice INEC accredits voters using the Bimodal Voter Accreditation System (BVAS) — fingerprint/facial verification against the register. A voter not accredited by the prescribed device is not allowed to vote." },
  { source: "electoral-act-2022", section: "Result transmission (IReV)", title: "Electronic transmission of results", ord: 3,
    content: "The Act allows INEC to transmit results electronically and to compile and maintain a central register of election results. The BVAS is used to scan and upload the polling-unit result sheet (EC8A) to the INEC Result Viewing portal (IReV) for public viewing. Collation officers may use electronically transmitted/uploaded results to verify collated figures." },
  { source: "electoral-act-2022", section: "Over-voting", title: "Over-voting cancels a unit result", ord: 4,
    content: "Where the number of votes cast at a polling unit exceeds the number of accredited voters, the result at that polling unit is cancelled and may be subject to a fresh election. Accreditation figures from the BVAS are the reference for detecting over-voting. This is a key ground observers watch for." },
  { source: "electoral-act-2022", section: "Counting & declaration", title: "Counting at the polling unit", ord: 5,
    content: "After close of poll, the Presiding Officer counts the votes at the polling unit in the presence of polling agents and observers, records them on Form EC8A, announces the result, gives copies to polling agents, and uploads via BVAS. Results are then collated upward: EC8A (unit) → EC8B (ward) → EC8C (LGA) → constituency/state collation → final declaration (EC8E)." },
  { source: "electoral-act-2022", section: "Candidate nomination", title: "Submission of candidates", ord: 6,
    content: "Political parties submit their list of candidates to INEC not later than 180 days before a general election, accompanied by candidates' affidavits. Party primaries must be conducted by direct, indirect, or consensus methods, and only aspirants who emerged from valid primaries monitored by INEC may be nominated. A candidate who dies before the poll triggers a defined replacement process." },
  { source: "electoral-act-2022", section: "Postponement", title: "Postponement of an election", ord: 7,
    content: "An election may be postponed by INEC where there is reason to believe a serious breach of peace, natural disaster or other emergency would make the election impossible; a new date is then appointed. Postponement/rescheduling is closely watched by observers for its integrity implications." },
  { source: "electoral-act-2022", section: "Election petitions", title: "Challenging results", ord: 8,
    content: "An aggrieved candidate/party may file an election petition at the relevant Election Tribunal. Under the constitutional timeline, a petition is filed within 21 days of the declaration of result; the tribunal delivers judgment within 180 days of filing, and appeals are decided within 60 days. Grounds include non-qualification, corrupt practices/non-compliance with the Act, and that the winner did not score the majority of lawful votes." },
  { source: "electoral-act-2022", section: "Presidential win rule", title: "How a President is declared", ord: 9,
    content: "To be declared President a candidate must have the highest number of votes AND at least one-quarter (25%) of the votes cast in at least two-thirds of the 36 States and the Federal Capital Territory. If no candidate meets this, a run-off is held between the top candidates. All other offices (Governor, Senator, Reps, State Assembly, LG Chairman, Councillor) are decided by simple majority (First-Past-The-Post) within their constituency." },
  { source: "electoral-structure", section: "Hierarchy", title: "Nigeria electoral structure", ord: 10,
    content: "Physical hierarchy (same for every election): State → LGA (774) → Ward/Registration Area (8,809) → Polling Unit (176,846). Electoral constituencies by office: Presidential = nation (36 states + FCT); Governorship = 1 state; Senatorial District = 109 (about 3 per state); Federal Constituency = 360 (House of Reps); State Constituency = 990 (State Assembly); LG Chairman = 1 LGA; Councillor = 1 ward. Result forms: EC8A (polling unit) → EC8B (ward) → EC8C (LGA) → EC8D (constituency/state collation) → EC8E (final declaration)." },
];

// Split a long pasted document into ~1500-char chunks on paragraph boundaries.
export function chunkText(text: string, maxLen = 1500): string[] {
  const paras = text.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > maxLen && buf) { chunks.push(buf); buf = p; }
    else buf = buf ? buf + "\n\n" + p : p;
  }
  if (buf) chunks.push(buf);
  return chunks;
}

// On first boot, load the curated summaries + the bundled full Electoral Act 2026
// so the assistant is grounded without any manual admin step.
// Bundled legal documents auto-loaded into the knowledge base. Both are public —
// the landing-page assistant (non-signed-in users) retrieves from these too.
export const LEGAL_DOCS: { source: string; file: string; label: string }[] = [
  { source: "electoral-act-2026", file: "electoral-act-2026.txt", label: "Electoral Act 2026" },
  { source: "regulations-2026", file: "regulations-2026.txt", label: "INEC Regulations & Guidelines 2026" },
];

async function readLegalFile(file: string): Promise<string> {
  for (const p of [`LEGAL/${file}`, `./LEGAL/${file}`]) {
    try { return await readFile(path.join(process.cwd(), p), "utf8"); } catch { /* try next */ }
  }
  return "";
}

// Chunk a legal doc and (re)load it under its source. Returns chunks added.
export async function loadLegalDoc(doc: { source: string; file: string; label: string }): Promise<number> {
  const text = await readLegalFile(doc.file);
  if (!text.trim()) return 0;
  await db.knowledgeChunk.deleteMany({ where: { source: doc.source } });
  const chunks = chunkText(text, 1500);
  await db.knowledgeChunk.createMany({
    data: chunks.map((content, i) => ({ source: doc.source, title: `${doc.label} — part ${i + 1}`, content, ord: i + 1 })),
  });
  return chunks.length;
}

export async function ensureKnowledgeSeeded(): Promise<{ seeded: boolean; chunks: number }> {
  const count = await db.knowledgeChunk.count();
  // Backfill: if only the older content is present but the regulations were never
  // loaded, load them without wiping the base.
  if (count > 0) {
    const hasRegs = await db.knowledgeChunk.count({ where: { source: "regulations-2026" } });
    if (hasRegs === 0) {
      const added = await loadLegalDoc(LEGAL_DOCS[1]);
      return { seeded: added > 0, chunks: count + added };
    }
    return { seeded: false, chunks: count };
  }

  await db.knowledgeChunk.createMany({ data: SEED_KNOWLEDGE });
  let added = SEED_KNOWLEDGE.length;
  for (const doc of LEGAL_DOCS) added += await loadLegalDoc(doc);
  return { seeded: true, chunks: added };
}

// Keyword retrieval over the knowledge base (small enough to score in memory).
export async function retrieveKnowledge(query: string, limit = 6): Promise<{ source: string; section?: string; title: string; content: string }[]> {
  const terms = [...new Set((query.toLowerCase().match(/[a-z0-9]{3,}/g) || []))];
  if (!terms.length) return [];
  const rows = await db.knowledgeChunk.findMany({ take: 1500 });
  const scored = rows
    .map((r) => {
      const hay = `${r.title} ${r.section ?? ""} ${r.content}`.toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score += 1;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((x) => ({ source: x.r.source, section: x.r.section ?? undefined, title: x.r.title, content: x.r.content }));
}
