"use client";
// Derive the tenant slug + a tenant-relative base from the current path.
//   /{slug}/agent | /{slug}/room | /{slug}/admin  → slug set, base "/{slug}"
//   bare /agent | /room | /admin                  → slug null, base ""
export function tenantFromPath(pathname: string): { slug: string | null; base: string } {
  const parts = pathname.split("/").filter(Boolean);
  const reserved = new Set(["agent", "room", "admin"]);
  if (parts.length >= 2 && reserved.has(parts[1])) return { slug: parts[0], base: `/${parts[0]}` };
  return { slug: null, base: "" };
}
