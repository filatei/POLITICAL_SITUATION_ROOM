import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { SEED_KNOWLEDGE, chunkText } from "@/lib/knowledge";

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

  // Load the full Electoral Act 2026 from the text file bundled in the repo/image.
  if (body.mode === "seed-act-file") {
    const source = "electoral-act-2026";
    let text = "";
    for (const p of ["LEGAL/electoral-act-2026.txt", "./LEGAL/electoral-act-2026.txt"]) {
      try { text = await readFile(path.join(process.cwd(), p), "utf8"); break; } catch { /* try next */ }
    }
    if (!text.trim()) return NextResponse.json({ error: "Act file not found in the deployment (LEGAL/electoral-act-2026.txt)." }, { status: 404 });
    await db.knowledgeChunk.deleteMany({ where: { source } });
    const chunks = chunkText(text, 1500);
    await db.knowledgeChunk.createMany({ data: chunks.map((content, i) => ({ source, title: `Electoral Act 2026 — part ${i + 1}`, content, ord: i + 1 })) });
    await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "knowledge:import", entity: "KnowledgeChunk", meta: { source, chunks: chunks.length } } });
    return NextResponse.json({ ok: true, source, added: chunks.length });
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
