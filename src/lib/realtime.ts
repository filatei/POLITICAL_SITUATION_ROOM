// Server-only realtime helpers shared by the custom server and API routes
// (they run in the same Node process, so the Socket.IO instance and the
// in-memory presence map are shared).
import type { Server as IOServer } from "socket.io";

type Presence = { agentId: string; name: string; unitId?: string | null; since: number };
const g = globalThis as unknown as { psrIO?: IOServer; psrPresence?: Map<string, Presence> };

const presence = g.psrPresence ?? new Map<string, Presence>();
g.psrPresence = presence;

export function setIO(io: IOServer) { g.psrIO = io; }
export function getIO(): IOServer | undefined { return g.psrIO; }

export function markOnline(p: Presence) { presence.set(p.agentId, p); }
export function markOffline(agentId: string) { presence.delete(agentId); }
export function isOnline(agentId: string) { return presence.has(agentId); }
export function presenceList(): Presence[] { return [...presence.values()]; }
export function presenceCount(): number { return presence.size; }

export function emitDashboard(event: string, payload: unknown) {
  g.psrIO?.to("dashboard").emit(event, payload);
}
export function emitAgent(agentId: string, event: string, payload: unknown) {
  g.psrIO?.to(`agent:${agentId}`).emit(event, payload);
}
export function broadcastPresence() {
  emitDashboard("presence:update", { online: presenceList(), count: presence.size });
}
