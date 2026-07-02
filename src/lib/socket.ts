"use client";
import { io, type Socket } from "socket.io-client";
import { getToken } from "./session";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      auth: { token: getToken() },
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
