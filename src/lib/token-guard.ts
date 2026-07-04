import { db } from "@/lib/db";
import type { Session } from "@/lib/auth";

// Revocation check: a JWT is only "current" if its token version still matches
// the account's, and (for agents) the account isn't suspended. Reset/suspend
// bumps tokenVersion, instantly invalidating already-issued tokens. Applied on
// the write + realtime paths (not every read) to keep GETs stateless/fast.
export async function tokenIsCurrent(s: Session | null): Promise<boolean> {
  if (!s) return false;
  const tv = s.tv ?? 0;
  if (s.kind === "agent") {
    const a = await db.agent.findUnique({ where: { id: s.sub }, select: { tokenVersion: true, status: true } });
    if (!a || a.status === "SUSPENDED") return false;
    return (a.tokenVersion ?? 0) === tv;
  }
  const u = await db.user.findUnique({ where: { id: s.sub }, select: { tokenVersion: true } });
  return !!u && (u.tokenVersion ?? 0) === tv;
}
