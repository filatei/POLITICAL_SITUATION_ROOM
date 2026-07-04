import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { slugify } from "@/lib/tenant";

export const runtime = "nodejs";

// Public: is a room address (slug) available? Two rooms can cover the same
// election but must have different URLs. If taken, suggest free alternatives.
export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get("slug") || "";
  const slug = slugify(raw);
  if (slug.length < 3) return NextResponse.json({ slug, available: false, tooShort: true, suggestions: [] });

  const taken = await db.tenant.findUnique({ where: { slug }, select: { slug: true } });
  if (!taken) return NextResponse.json({ slug, available: true, suggestions: [] });

  const rand = Math.random().toString(36).slice(2, 5);
  const candidates = [`${slug}-2`, `${slug}-2027`, `${slug}-live`, `${slug}-room`, `${slug}-${rand}`];
  const suggestions: string[] = [];
  for (const c of candidates) {
    if (suggestions.length >= 3) break;
    const hit = await db.tenant.findUnique({ where: { slug: c }, select: { slug: true } });
    if (!hit) suggestions.push(c);
  }
  return NextResponse.json({ slug, available: false, suggestions });
}
