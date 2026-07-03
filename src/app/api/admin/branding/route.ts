import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { getBrand } from "@/lib/brand";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getBrand());
}

export async function PATCH(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { name, tagline, accent, logoUrl } = await req.json();

  const data: any = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof tagline === "string") data.tagline = tagline.trim();
  if (typeof accent === "string" && /^#?[0-9a-fA-F]{6}$/.test(accent.trim())) data.accent = accent.trim().startsWith("#") ? accent.trim() : `#${accent.trim()}`;
  if (logoUrl !== undefined) data.logoUrl = logoUrl ? String(logoUrl).trim() : null;

  await db.branding.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "branding:update", entity: "Branding", meta: data } });
  return NextResponse.json({ ok: true, brand: await getBrand() });
}
