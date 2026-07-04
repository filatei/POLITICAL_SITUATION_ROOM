import { EventEmitter } from "events";

// A single in-process bus that fans new submissions out to all connected
// situation-room SSE clients. Kept on globalThis so it survives dev HMR.
export type LiveEvent = {
  kind: "submission" | "score" | "verify" | "ping";
  electionId?: string; // routes the event to that election's dashboard room
  payload: unknown;
  at: string;
};

// IMPORTANT: store the bus on globalThis UNCONDITIONALLY. The Next route
// bundle (which publish()es) and the custom server bundle (which subscribe()s)
// are separate module instances but share the one Node globalThis — so they
// must use the same EventEmitter for the live relay to work in production.
const g = globalThis as unknown as { psrBus?: EventEmitter };
const bus = g.psrBus ?? new EventEmitter();
bus.setMaxListeners(0);
g.psrBus = bus;

export function publish(evt: Omit<LiveEvent, "at">) {
  bus.emit("evt", { ...evt, at: new Date().toISOString() } as LiveEvent);
}

export function subscribe(cb: (evt: LiveEvent) => void) {
  bus.on("evt", cb);
  return () => bus.off("evt", cb);
}
