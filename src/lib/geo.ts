import { db } from "./db";

// Resolve which polling unit / tiers a submission belongs to and a readable label.
export async function unitLabel(pollingUnitId?: string | null): Promise<string> {
  if (!pollingUnitId) return "Unknown unit";
  const pu = await db.pollingUnit.findUnique({
    where: { id: pollingUnitId },
    include: { ward: true, lga: true, state: true },
  });
  if (!pu) return "Unknown unit";
  return `${pu.name} · ${pu.ward.name} · ${pu.lga.name} · ${pu.state.name}`;
}
