import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

export const runtime = "nodejs";

// Geographic drill-down for admins: LGA -> Ward -> Unit, plus a unit detail
// view (codes filed there + the scores/messages/incidents received there).
//   GET /api/admin/geo                 -> LGAs with ward/unit/code counts
//   GET /api/admin/geo?lgaId=…         -> wards in that LGA
//   GET /api/admin/geo?wardId=…        -> units in that ward
//   GET /api/admin/geo?unitId=…        -> unit detail (codes + submissions)
export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const lgaId = url.searchParams.get("lgaId");
  const wardId = url.searchParams.get("wardId");
  const unitId = url.searchParams.get("unitId");

  // ---- Unit detail ----
  if (unitId) {
    const unit = await db.pollingUnit.findUnique({
      where: { id: unitId },
      include: { ward: true, lga: true, state: true },
    });
    if (!unit) return NextResponse.json({ error: "Unknown unit." }, { status: 404 });

    const [agents, subs] = await Promise.all([
      db.agent.findMany({ where: { pollingUnitId: unitId }, orderBy: { createdAt: "desc" } }),
      db.submission.findMany({
        where: { pollingUnitId: unitId },
        orderBy: { receivedAt: "desc" },
        take: 60,
        include: { agent: true, user: true, scores: { include: { candidate: { include: { party: true } } } }, media: true },
      }),
    ]);

    return NextResponse.json({
      unit: {
        id: unit.id, name: unit.name, code: unit.code, registeredVoters: unit.registeredVoters,
        label: `${unit.name} · ${unit.ward.name} · ${unit.lga.name}`,
        ward: unit.ward.name, lga: unit.lga.name, state: unit.state.name,
      },
      codes: agents.map((a) => ({
        id: a.id, name: a.name, inviteCode: a.inviteCode, status: a.status,
        email: a.email, phone: a.phone, usedAt: a.inviteUsedAt, lastSeenAt: a.lastSeenAt,
      })),
      submissions: subs.map((r) => ({
        id: r.id, type: r.type, text: r.text, severity: r.severity, confidence: r.confidence,
        scoreStatus: r.scoreStatus, receivedAt: r.receivedAt,
        author: r.agent?.name ?? r.user?.name ?? "Unknown",
        scores: r.scores.map((x) => ({ party: x.candidate.party.code, color: x.candidate.party.color, votes: x.votes })),
        media: r.media.map((m) => ({ url: m.url, thumbUrl: m.thumbUrl, kind: m.kind, mime: m.mime })),
      })),
    });
  }

  // ---- Units in a ward ----
  if (wardId) {
    const units = await db.pollingUnit.findMany({
      where: { wardId },
      orderBy: { name: "asc" },
      include: { agents: { select: { inviteUsedAt: true, status: true } }, _count: { select: { submissions: true } } },
    });
    return NextResponse.json({
      units: units.map((u) => ({
        id: u.id, name: u.name, code: u.code,
        codes: u.agents.length,
        used: u.agents.filter((a) => a.inviteUsedAt).length,
        active: u.agents.filter((a) => a.status === "ACTIVE").length,
        reports: u._count.submissions,
      })),
    });
  }

  // ---- Wards in an LGA ----
  if (lgaId) {
    const wards = await db.ward.findMany({
      where: { lgaId },
      orderBy: { name: "asc" },
      include: { _count: { select: { units: true, agents: true } } },
    });
    return NextResponse.json({
      wards: wards.map((w) => ({ id: w.id, name: w.name, code: w.code, units: w._count.units, codes: w._count.agents })),
    });
  }

  // ---- All LGAs ----
  const lgas = await db.lga.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { wards: true, units: true, agents: true } } },
  });
  return NextResponse.json({
    lgas: lgas.map((l) => ({ id: l.id, name: l.name, wards: l._count.wards, units: l._count.units, codes: l._count.agents })),
  });
}
