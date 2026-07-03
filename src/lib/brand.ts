import { db } from "@/lib/db";

export type Brand = { name: string; tagline: string; accent: string; accentRgb: string; logoUrl: string | null };

const DEFAULTS = { name: "Situation Room", tagline: "Real-time election monitoring", accent: "#5b8cff", logoUrl: null as string | null };

// Hex "#5b8cff" → "91 140 255" for the `--accent` CSS variable.
export function hexToRgbTriplet(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  if (!m) return "91 140 255";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export async function getBrand(): Promise<Brand> {
  try {
    const b = await db.branding.findFirst();
    const base = b ? { name: b.name, tagline: b.tagline, accent: b.accent, logoUrl: b.logoUrl } : DEFAULTS;
    return { ...base, accentRgb: hexToRgbTriplet(base.accent) };
  } catch {
    return { ...DEFAULTS, accentRgb: hexToRgbTriplet(DEFAULTS.accent) };
  }
}
