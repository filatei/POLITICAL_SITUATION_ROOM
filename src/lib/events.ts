import { EventEmitter } from "events";

// A single in-process bus that fans new submissions out to all connected
// situation-room SSE clients. Kept on globalThis so it survives dev HMR.
export type LiveEvent = {
  kind: "submission" | "score" | "verify" | "ping";
  payload: unknown;
  at: string;
};

const g = globalThis as unknown as { psrBus?: EventEmitter };
const bus = g.psrBus ?? new EventEmitter();
bus.setMaxListeners(0);
if (process.env.NODE_ENV !== "production") g.psrBus = bus;

export function publish(evt: Omit<LiveEvent, "at">) {
  bus.emit("evt", { ...evt, at: new Date().toISOString() } as LiveEvent);
}

export function subscribe(cb: (evt: LiveEvent) => void) {
  bus.on("evt", cb);
  return () => bus.off("evt", cb);
}
