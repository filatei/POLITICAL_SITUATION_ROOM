// Server-only realtime helpers shared by the custom server and API routes
// (same Node process → shared Socket.IO instance + in-memory presence).
import type { Server as IOServer } from "socket.io";

export type Presence = {
  agentId: string;
  name: string;
  electionId: string;
  unitId?: string | null;
  unitLabel?: string | null;
  since: number;
};

// Presence is keyed BY ELECTION so each situation room only ever sees its own
// agents. A flat id→electionId index keeps isOnline()/markOffline() O(1).
const g = globalThis as unknown as {
  psrIO?: IOServer;
  psrPresence?: Map<string, Map<string, Presence>>; // electionId -> (agentId -> Presence)
  psrOnlineIndex?: Map<string, string>;             // agentId -> electionId
};

const byElection = g.psrPresence ?? new Map<string, Map<string, Presence>>();
g.psrPresence = byElection;
const index = g.psrOnlineIndex ?? new Map<string, string>();
g.psrOnlineIndex = index;

export function setIO(io: IOServer) { g.psrIO = io; }
export function getIO(): IOServer | undefined { return g.psrIO; }

export function markOnline(p: Presence) {
  let m = byElection.get(p.electionId);
  if (!m) { m = new Map(); byElection.set(p.electionId, m); }
  m.set(p.agentId, p);
  index.set(p.agentId, p.electionId);
}
export function markOffline(agentId: string) {
  const eid = index.get(agentId);
  if (eid) byElection.get(eid)?.delete(agentId);
  index.delete(agentId);
}
export function isOnline(agentId: string) { return index.has(agentId); }
export function presenceListFor(electionId: string): Presence[] {
  return [...(byElection.get(electionId)?.values() ?? [])];
}
export function presenceCountFor(electionId: string): number {
  return byElection.get(electionId)?.size ?? 0;
}

// Dashboard events are namespaced by election so nothing leaks across tenants.
export function emitDashboard(electionId: string, event: string, payload: unknown) {
  g.psrIO?.to(`dashboard:${electionId}`).emit(event, payload);
}
export function emitAgent(agentId: string, event: string, payload: unknown) {
  g.psrIO?.to(`agent:${agentId}`).emit(event, payload);
}
export function broadcastPresence(electionId: string) {
  emitDashboard(electionId, "presence:update", {
    online: presenceListFor(electionId),
    count: presenceCountFor(electionId),
  });
}
