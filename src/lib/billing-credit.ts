import { db } from "@/lib/db";

// Idempotently mark a payment PAID and add its seats to the election subscription.
export async function creditPaidSeats(reference: string, verifiedAmountKobo?: number) {
  const p = await db.payment.findUnique({ where: { reference } });
  if (!p) return { ok: false, reason: "unknown-reference" };
  if (p.status === "PAID") return { ok: true, already: true, seats: p.seats };
  if (verifiedAmountKobo != null && verifiedAmountKobo < p.amount) return { ok: false, reason: "amount-mismatch" };

  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: p.id }, data: { status: "PAID" } });
    if (p.electionId) {
      const sub = await tx.subscription.findUnique({ where: { electionId: p.electionId } });
      if (sub) await tx.subscription.update({ where: { id: sub.id }, data: { paidSeats: sub.paidSeats + p.seats } });
      else await tx.subscription.create({ data: { electionId: p.electionId, paidSeats: p.seats } });
    }
  });
  await db.auditLog.create({ data: { actorType: "system", action: "billing:paid", entity: "Payment", entityId: p.id, meta: { reference, seats: p.seats, amount: p.amount } } });
  return { ok: true, seats: p.seats };
}
