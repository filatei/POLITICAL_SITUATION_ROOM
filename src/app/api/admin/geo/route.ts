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
  const stateId = url.searchParams.get("stateId");
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

  // ---- LGAs in a state ----
  if (stateId) {
    const lgas = await db.lga.findMany({
      where: { stateId },
      orderBy: { name: "asc" },
      include: { _count: { select: { wards: true, units: true, agents: true } } },
    });
    return NextResponse.json({
      lgas: lgas.map((l) => ({ id: l.id, name: l.name, wards: l._count.wards, units: l._count.units, codes: l._count.agents })),
    });
  }

  // ---- All states (top of the tree) ----
  const states = await db.state.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { lgas: true, units: true, agents: true } } },
  });
  const wardCounts = await db.ward.groupBy({ by: ["lgaId"], _count: { _all: true } });
  // Map ward counts up to states via a single lga→state lookup.
  const lgaState = await db.lga.findMany({ select: { id: true, stateId: true } });
  const stateOfLga = new Map(lgaState.map((l) => [l.id, l.stateId]));
  const wardsByState = new Map<string, number>();
  for (const w of wardCounts) {
    const sid = stateOfLga.get(w.lgaId);
    if (sid) wardsByState.set(sid, (wardsByState.get(sid) || 0) + w._count._all);
  }
  return NextResponse.json({
    states: states.map((s) => ({
      id: s.id, name: s.name, code: s.code,
      lgas: s._count.lgas, wards: wardsByState.get(s.id) || 0, units: s._count.units, codes: s._count.agents,
    })),
  });
}

// Manually add a State / LGA / Ward / Polling-Unit branch (for INEC gaps that can't
// be harvested). Upserts the hierarchy; whatever level's name is provided is created.
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const stateName = String(b.state || "").toUpperCase().trim();
  const lgaName = String(b.lga || "").trim();
  const wardName = String(b.ward || "").trim();
  const puName = String(b.pu || "").trim();
  const voters = Number(b.registeredVoters) || 0;
  if (!stateName) return NextResponse.json({ error: "state is required" }, { status: 400 });

  const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "x";

  const existingState = await db.state.findFirst({ where: { name: stateName } });
  const st = existingState || (await db.state.create({ data: { code: `m-${slug(stateName)}`, name: stateName } }));

  let created: any = { state: st.name };
  if (lgaName) {
    const lCode = `${st.code}-${slug(lgaName)}`;
    const lga = await db.lga.upsert({ where: { stateId_code: { stateId: st.id, code: lCode } }, update: { name: lgaName }, create: { stateId: st.id, code: lCode, name: lgaName } });
    created.lga = lga.name;
    if (wardName) {
      const wCode = `${lCode}-${slug(wardName)}`;
      const ward = await db.ward.upsert({ where: { lgaId_code: { lgaId: lga.id, code: wCode } }, update: { name: wardName }, create: { lgaId: lga.id, code: wCode, name: wardName } });
      created.ward = ward.name;
      if (puName) {
        const uCode = `${wCode}-${slug(puName)}-${Date.now().toString(36).slice(-4)}`;
        const pu = await db.pollingUnit.create({ data: { wardId: ward.id, lgaId: lga.id, stateId: st.id, code: uCode, name: puName, registeredVoters: voters } });
        created.pu = pu.name;
      }
    }
  }
  await db.auditLog.create({ data: { actorType: s!.kind, actorId: s!.sub, action: "geo:manual-add", entity: "PollingUnit", meta: created } });
  return NextResponse.json({ ok: true, created });
}
