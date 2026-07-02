import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const lgaId = url.searchParams.get("lgaId") || undefined;

  const lgas = await db.lga.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const units = await db.pollingUnit.findMany({
    where: {
      ...(lgaId ? { lgaId } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
    },
    include: { ward: true, lga: true, _count: { select: { agents: true } } },
    orderBy: [{ lga: { name: "asc" } }, { name: "asc" }],
    take: 300,
  });
  return NextResponse.json({
    lgas,
    units: units.map((u) => ({
      id: u.id, name: u.name, code: u.code, ward: u.ward.name, lga: u.lga.name,
      label: `${u.name} · ${u.ward.name} · ${u.lga.name}`, agents: u._count.agents,
    })),
  });
}
