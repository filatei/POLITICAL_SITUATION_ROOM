// Custom server: Next.js + Socket.IO on one port (single deploy).
// Realtime tier for presence, targeted instructions, and delivery receipts.
// Submissions still go over HTTP POST + offline outbox — never sockets.
import { createServer } from "http";
import next from "next";
import { Server as IOServer } from "socket.io";
import { verifySession, type Session } from "./src/lib/auth";
import { subscribe } from "./src/lib/events";
import { db } from "./src/lib/db";
import { setIO, markOnline, markOffline, broadcastPresence, emitDashboard } from "./src/lib/realtime";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3200);
const app = next({ dev });
const handle = app.getRequestHandler();

function cookieToken(cookie?: string): string | undefined {
  if (!cookie) return undefined;
  const m = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("psr_token="));
  return m ? decodeURIComponent(m.slice("psr_token=".length)) : undefined;
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  const io = new IOServer(server, { path: "/socket.io", cors: { origin: true, credentials: true } });
  setIO(io);

  // Authenticate every socket with the same JWT (auth.token or cookie).
  io.use(async (socket, nextFn) => {
    const token = (socket.handshake.auth?.token as string) || cookieToken(socket.handshake.headers.cookie);
    const session = token ? await verifySession(token) : null;
    if (!session) return nextFn(new Error("unauthorized"));
    (socket.data as { session: Session }).session = session;
    nextFn();
  });

  io.on("connection", async (socket) => {
    const s = (socket.data as { session: Session }).session;

    if (s.kind === "user") {
      socket.join("dashboard");
      socket.emit("presence:update", { online: [], count: 0 });
      broadcastPresence();
      return;
    }

    // Agent
    const agentId = s.sub;
    socket.join(`agent:${agentId}`);
    if (s.electionId) socket.join(`election:${s.electionId}`);
    markOnline({ agentId, name: s.name, unitId: s.unitId, since: Date.now() });
    db.agent.update({ where: { id: agentId }, data: { lastSeenAt: new Date() } }).catch(() => {});
    broadcastPresence();

    // Flush any instructions that were queued while the agent was offline.
    try {
      const pending = await db.instructionReceipt.findMany({
        where: { agentId, status: "SENT" },
        include: { instruction: true },
        take: 50,
      });
      for (const r of pending) {
        socket.emit("instruction", {
          receiptId: r.id, id: r.instruction.id, title: r.instruction.title,
          body: r.instruction.body, severity: r.instruction.severity, createdAt: r.instruction.createdAt,
        });
      }
    } catch {}

    socket.on("presence", () => {
      db.agent.update({ where: { id: agentId }, data: { lastSeenAt: new Date() } }).catch(() => {});
    });

    socket.on("instruction:ack", async ({ receiptId }: { receiptId: string }) => {
      try {
        const r = await db.instructionReceipt.update({
          where: { id: receiptId }, data: { status: "DELIVERED", deliveredAt: new Date() },
        });
        emitDashboard("receipt:update", { receiptId, instructionId: r.instructionId, agentId, status: "DELIVERED" });
      } catch {}
    });

    socket.on("instruction:read", async ({ receiptId }: { receiptId: string }) => {
      try {
        const r = await db.instructionReceipt.update({
          where: { id: receiptId }, data: { status: "READ", readAt: new Date(), ackedAt: new Date() },
        });
        emitDashboard("receipt:update", { receiptId, instructionId: r.instructionId, agentId, status: "READ" });
      } catch {}
    });

    socket.on("disconnect", () => {
      markOffline(agentId);
      db.agent.update({ where: { id: agentId }, data: { lastSeenAt: new Date() } }).catch(() => {});
      broadcastPresence();
    });
  });

  // Bridge the existing in-process event bus (POST routes publish to it) to the
  // dashboard room, so the live wall works over sockets with zero route changes.
  subscribe((evt) => io.to("dashboard").emit("live", evt));

  server.listen(port, () => console.log(`> Situation Room on http://localhost:${port} (Next + Socket.IO)`));
});
