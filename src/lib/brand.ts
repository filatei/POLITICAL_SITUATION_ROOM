import { cookies } from "next/headers";
import { db } from "@/lib/db";

export type Brand = { name: string; tagline: string; accent: string; accentRgb: string; logoUrl: string | null };

const DEFAULTS = { name: "PSR", tagline: "Election situation room", accent: "#26a65b", logoUrl: "/psr-logo.png" as string | null };

// Hex "#5b8cff" → "91 140 255" for the `--accent` CSS variable.
export function hexToRgbTriplet(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  if (!m) return "91 140 255";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

// Resolve branding for the tenant currently being viewed (via the psr_tenant
// cookie). No tenant (e.g. the public landing) → the PSR platform default, so a
// tenant's brand never bleeds onto the marketing site or another room.
export async function getBrand(): Promise<Brand> {
  try {
    let b: { name: string; tagline: string; accent: string; logoUrl: string | null } | null = null;
    const slug = cookies().get("psr_tenant")?.value;
    if (slug) {
      const t = await db.tenant.findUnique({ where: { slug: slug.toLowerCase() }, select: { electionId: true } });
      if (t) b = await db.branding.findUnique({ where: { electionId: t.electionId } });
    }
    const base = b ? { name: b.name, tagline: b.tagline, accent: b.accent, logoUrl: b.logoUrl } : DEFAULTS;
    return { ...base, accentRgb: hexToRgbTriplet(base.accent) };
  } catch {
    return { ...DEFAULTS, accentRgb: hexToRgbTriplet(DEFAULTS.accent) };
  }
}
