import { db } from "@/lib/db";
import { paystackVerify, squadVerify } from "@/lib/payments";

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

// Webhook-independent safety net: verify PENDING payments directly with the
// provider and credit any that succeeded. Lets this outlet run on a SHARED
// merchant whose single webhook is owned by another app — we never need to
// receive the webhook here; we confirm by API.
export async function reconcilePending(limit = 30) {
  const pending = await db.payment.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: limit });
  let credited = 0, checked = 0;
  for (const p of pending) {
    checked++;
    try {
      const v = p.provider === "SQUAD" ? await squadVerify(p.reference) : await paystackVerify(p.reference);
      if (v.ok) { const c = await creditPaidSeats(p.reference, v.amount); if (c.ok && !("already" in c && c.already)) credited++; }
    } catch { /* skip; try again next sweep */ }
  }
  return { checked, credited };
}
