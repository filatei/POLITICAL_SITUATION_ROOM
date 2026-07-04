// INEC-registered political parties (Nigeria). Used to seed a new election's
// ballot so agents can report per-party scores immediately; the tenant admin
// edits this list (removes parties not contesting, adds candidates, tweaks
// colours) from the admin console. Verify against the current INEC gazette:
// https://www.inecnigeria.org/list-of-political-parties/
export type PartySeed = { code: string; name: string; color: string };

export const DEFAULT_PARTIES: PartySeed[] = [
  { code: "A", name: "Accord", color: "#0ea5e9" },
  { code: "AA", name: "Action Alliance", color: "#f97316" },
  { code: "AAC", name: "African Action Congress", color: "#84cc16" },
  { code: "ADC", name: "African Democratic Congress", color: "#0891b2" },
  { code: "ADP", name: "African Democratic Party", color: "#14b8a6" },
  { code: "APC", name: "All Progressives Congress", color: "#2563eb" },
  { code: "APGA", name: "All Progressives Grand Alliance", color: "#ca8a04" },
  { code: "APM", name: "Allied Peoples Movement", color: "#9333ea" },
  { code: "APP", name: "Action Peoples Party", color: "#e11d48" },
  { code: "BP", name: "Boot Party", color: "#a16207" },
  { code: "LP", name: "Labour Party", color: "#059669" },
  { code: "NNPP", name: "New Nigeria Peoples Party", color: "#7c3aed" },
  { code: "NRM", name: "National Rescue Movement", color: "#db2777" },
  { code: "PDP", name: "Peoples Democratic Party", color: "#dc2626" },
  { code: "PRP", name: "Peoples Redemption Party", color: "#65a30d" },
  { code: "SDP", name: "Social Democratic Party", color: "#16a34a" },
  { code: "YPP", name: "Young Progressive Party", color: "#0d9488" },
  { code: "ZLP", name: "Zenith Labour Party", color: "#4f46e5" },
  // Newly registered ahead of the 2027 general election — confirm with INEC:
  { code: "DLA", name: "Democratic Leadership Alliance", color: "#c026d3" },
  { code: "NDC", name: "Nigeria Democratic Congress", color: "#0284c7" },
];

// Insert the standard ballot for an election, skipping any party code already
// present (so it is safe to call more than once).
export async function seedParties(db: any, electionId: string): Promise<number> {
  const existing = await db.party.findMany({ where: { electionId }, select: { code: true } });
  const have = new Set(existing.map((p: any) => p.code));
  const toAdd = DEFAULT_PARTIES.filter((p) => !have.has(p.code));
  if (toAdd.length) {
    await db.party.createMany({
      data: toAdd.map((p) => ({ electionId, code: p.code, name: p.name, color: p.color })),
      skipDuplicates: true,
    });
  }
  return toAdd.length;
}
