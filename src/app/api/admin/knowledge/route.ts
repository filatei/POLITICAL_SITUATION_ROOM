import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { SEED_KNOWLEDGE, chunkText, LEGAL_DOCS, loadLegalDoc } from "@/lib/knowledge";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db.knowledgeChunk.groupBy({ by: ["source"], _count: { _all: true } });
  return NextResponse.json({ sources: rows.map((r) => ({ source: r.source, chunks: r._count._all })) });
}

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();

  // Load the curated Electoral-Act / structure / app-guide summaries (idempotent).
  if (body.mode === "seed") {
    const sources = [...new Set(SEED_KNOWLEDGE.map((k) => k.source))];
    await db.knowledgeChunk.deleteMany({ where: { source: { in: sources } } });
    await db.knowledgeChunk.createMany({ data: SEED_KNOWLEDGE });
    return NextResponse.json({ ok: true, added: SEED_KNOWLEDGE.length, sources });
  }

  // Load the bundled legal documents (Electoral Act 2026 + INEC Regulations &
  // Guidelines 2026) from the text files shipped in the repo/image. Both are public.
  if (body.mode === "seed-act-file" || body.mode === "seed-legal-docs") {
    const results: { source: string; added: number }[] = [];
    // Optional single-doc targeting via body.source; default = all bundled docs.
    const docs = body.source ? LEGAL_DOCS.filter((d) => d.source === body.source) : LEGAL_DOCS;
    for (const doc of docs) results.push({ source: doc.source, added: await loadLegalDoc(doc) });
    const total = results.reduce((n, r) => n + r.added, 0);
    if (total === 0) return NextResponse.json({ error: "No legal doc text found in the deployment (LEGAL/*.txt)." }, { status: 404 });
    await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "knowledge:import", entity: "KnowledgeChunk", meta: { results } } });
    return NextResponse.json({ ok: true, added: total, results });
  }

  // Bulk import a full document: chunk the pasted text under a source.
  if (typeof body.text === "string" && body.text.trim()) {
    const source = String(body.source || "electoral-act-2022-full").trim();
    const replace = body.replace !== false;
    if (replace) await db.knowledgeChunk.deleteMany({ where: { source } });
    const chunks = chunkText(body.text, 1500);
    const existing = replace ? 0 : await db.knowledgeChunk.count({ where: { source } });
    await db.knowledgeChunk.createMany({
      data: chunks.map((content, i) => ({ source, title: `${source} — part ${existing + i + 1}`, content, ord: existing + i + 1 })),
    });
    await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "knowledge:import", entity: "KnowledgeChunk", meta: { source, chunks: chunks.length } } });
    return NextResponse.json({ ok: true, source, added: chunks.length });
  }

  // Single chunk.
  if (body.title && body.content) {
    const c = await db.knowledgeChunk.create({ data: { source: String(body.source || "note"), section: body.section || null, title: body.title, content: body.content, ord: Number(body.ord) || 0 } });
    return NextResponse.json({ ok: true, id: c.id });
  }

  return NextResponse.json({ error: "Nothing to do — pass { mode:'seed' }, { source, text }, or { title, content }." }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const source = new URL(req.url).searchParams.get("source");
  if (!source) return NextResponse.json({ error: "source required." }, { status: 400 });
  const r = await db.knowledgeChunk.deleteMany({ where: { source } });
  return NextResponse.json({ ok: true, deleted: r.count });
}
