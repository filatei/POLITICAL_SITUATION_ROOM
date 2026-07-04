import { db } from "@/lib/db";

// Free tier = 20 agent codes per LGA in the election's scope. A constituency
// contest counts its member LGAs; a state contest counts the state's LGAs; a
// national contest counts all 774.
export async function freeSeatsFor(e: { scopeStateId: string | null; scopeConstituencyId: string | null }): Promise<number> {
  const lgaCount = e.scopeConstituencyId
    ? await db.constituencyLga.count({ where: { constituencyId: e.scopeConstituencyId } })
    : e.scopeStateId
      ? await db.lga.count({ where: { stateId: e.scopeStateId } })
      : await db.lga.count();
  return 20 * Math.max(1, lgaCount);
}

// Bring every election's free allotment up to the current 20/LGA policy. Only
// ever RAISES freeSeats (never lowers a custom/grandfathered grant), so it's
// safe to run on every boot. Fixes rooms created under the old flat-10 tier.
export async function backfillFreeSeats(): Promise<{ updated: number }> {
  const elections = await db.election.findMany({ select: { id: true, scopeStateId: true, scopeConstituencyId: true } });
  let updated = 0;
  for (const e of elections) {
    const want = await freeSeatsFor(e);
    const sub = await db.subscription.findUnique({ where: { electionId: e.id } });
    if (!sub) { await db.subscription.create({ data: { electionId: e.id, freeSeats: want } }); updated++; continue; }
    if (sub.freeSeats < want) { await db.subscription.update({ where: { electionId: e.id }, data: { freeSeats: want } }); updated++; }
  }
  return { updated };
}
