import { db } from "@/lib/db";

// Seat balance for an election. A seat = one agent code. Viewing polling units is
// always unlimited (shared geography); only CODE CREATION consumes seats.
export async function seatStatus(electionId?: string) {
  const election = electionId
    ? await db.election.findUnique({ where: { id: electionId } })
    : await db.election.findFirst({ orderBy: { createdAt: "desc" } });
  if (!election) return null;

  let sub = await db.subscription.findUnique({ where: { electionId: election.id } });
  if (!sub) sub = await db.subscription.create({ data: { electionId: election.id } });

  const used = await db.agent.count({ where: { electionId: election.id } });
  const total = sub.freeSeats + sub.paidSeats;
  return {
    electionId: election.id, electionName: election.name,
    freeSeats: sub.freeSeats, paidSeats: sub.paidSeats, total, used,
    available: Math.max(0, total - used),
  };
}
