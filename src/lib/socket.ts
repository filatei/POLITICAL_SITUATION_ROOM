"use client";
import { io, type Socket } from "socket.io-client";
import { getToken } from "./session";

let socket: Socket | null = null;

// The tenant/room slug this browser is viewing (set by TenantScope). Lets the
// server put a super-admin's dashboard socket into the right election room.
function tenantSlug(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("psr_tenant="));
  return m ? decodeURIComponent(m.slice("psr_tenant=".length)) : undefined;
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      auth: { token: getToken(), tenant: tenantSlug() },
      transports: ["websocket", "polling"],
      reconnection: true,
    });
  }
  return socket;
}

export function closeSocket() {
  socket?.close();
  socket = null;
}
