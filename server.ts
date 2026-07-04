// Custom server: Next.js + Socket.IO on one port (single deploy).
// Realtime tier for presence, targeted instructions, and delivery receipts.
// Submissions still go over HTTP POST + offline outbox — never sockets.
import "./src/lib/als"; // MUST be first: installs globalThis.AsyncLocalStorage before any next import
import { createServer } from "http";
import next from "next";
import { Server as IOServer } from "socket.io";
import { verifySession, type Session } from "./src/lib/auth";
import { subscribe } from "./src/lib/events";
import { db } from "./src/lib/db";
import { setIO, markOnline, markOffline, broadcastPresence, emitDashboard } from "./src/lib/realtime";
import { reconcilePending } from "./src/lib/billing-credit";
import { paystackEnabled, squadEnabled } from "./src/lib/payments";
import { ensureKnowledgeSeeded } from "./src/lib/knowledge";
import { ensureDefaultTenant } from "./src/lib/tenant";

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
  // Lock Socket.IO CORS to known origins (APP_URL + localhost for dev) instead of
  // reflecting any origin with credentials.
  const allowed = new Set(
    [process.env.APP_URL, "http://localhost:3200", "http://localhost:3000"]
      .filter(Boolean).map((o) => (o as string).replace(/\/+$/, "")),
  );
  const io = new IOServer(server, {
    path: "/socket.io",
    cors: {
      credentials: true,
      origin: (origin, cb) => cb(null, !origin || allowed.size === 0 || allowed.has(origin.replace(/\/+$/, ""))),
    },
  });
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
      // Which election's room is this staff viewing? Pinned staff → their own;
      // super-admins (unpinned) → the tenant slug passed in the socket handshake.
      let dashElection = s.electionId || null;
      if (!dashElection) {
        const slug = (socket.handshake.auth?.tenant as string) || undefined;
        if (slug) { const t = await db.tenant.findUnique({ where: { slug: slug.toLowerCase() } }).catch(() => null); dashElection = t?.electionId || null; }
      }
      if (dashElection) {
        socket.join(`dashboard:${dashElection}`);
        broadcastPresence(dashElection);
      }
      return;
    }

    // Agent
    const agentId = s.sub;
    const electionId = s.electionId || null;
    socket.join(`agent:${agentId}`);
    if (electionId) socket.join(`election:${electionId}`);
    // Enrich presence with the agent's polling-unit label so the room roster can
    // show WHERE each online agent is.
    let unitLabel: string | null = null;
    if (s.unitId) {
      const u = await db.pollingUnit.findUnique({ where: { id: s.unitId }, include: { ward: true, lga: true } }).catch(() => null);
      if (u) unitLabel = `${u.name} · ${u.ward.name} · ${u.lga.name}`;
    }
    if (electionId) {
      markOnline({ agentId, name: s.name, electionId, unitId: s.unitId, unitLabel, since: Date.now() });
      broadcastPresence(electionId);
    }
    db.agent.update({ where: { id: agentId }, data: { lastSeenAt: new Date() } }).catch(() => {});

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
        if (electionId) emitDashboard(electionId, "receipt:update", { receiptId, instructionId: r.instructionId, agentId, status: "DELIVERED" });
      } catch {}
    });

    socket.on("instruction:read", async ({ receiptId }: { receiptId: string }) => {
      try {
        const r = await db.instructionReceipt.update({
          where: { id: receiptId }, data: { status: "READ", readAt: new Date(), ackedAt: new Date() },
        });
        if (electionId) emitDashboard(electionId, "receipt:update", { receiptId, instructionId: r.instructionId, agentId, status: "READ" });
      } catch {}
    });

    socket.on("disconnect", () => {
      markOffline(agentId);
      db.agent.update({ where: { id: agentId }, data: { lastSeenAt: new Date() } }).catch(() => {});
      if (electionId) broadcastPresence(electionId);
    });
  });

  // Bridge the in-process event bus (POST routes publish to it) to that
  // election's dashboard room — never a global broadcast (tenant isolation).
  subscribe((evt) => { if (evt.electionId) io.to(`dashboard:${evt.electionId}`).emit("live", evt); });

  // Seed the AI knowledge base (Electoral Act + summaries) on first boot.
  ensureKnowledgeSeeded()
    .then((r) => { if (r.seeded) console.log(`> knowledge base seeded: ${r.chunks} chunks`); })
    .catch(() => {});

  // Wrap the existing election in a default tenant (ondogov2027) on first boot.
  ensureDefaultTenant()
    .then((r) => { if (r.created) console.log(`> default tenant created: ${r.slug}`); })
    .catch(() => {});

  // Auto-reconcile billing: since a shared merchant's single webhook may live in
  // another app, verify PENDING payments directly with Paystack/Squad on a timer
  // so seats are credited without any webhook or manual click.
  if (paystackEnabled || squadEnabled) {
    const sweep = () => reconcilePending(40)
      .then((r) => { if (r.credited) console.log(`> billing reconcile: credited ${r.credited}/${r.checked}`); })
      .catch(() => {});
    setInterval(sweep, 3 * 60 * 1000); // every 3 minutes
    setTimeout(sweep, 30 * 1000);       // once shortly after boot
  }

  // App-side monthly refresh of the INEC party registry (details + change
  // history). Self-tracked via PartyRegistry.checkedAt — runs when the newest
  // record is older than ~27 days; if INEC blocks the server fetch it simply
  // retries next tick (checkedAt only advances on success).
  const refreshParties = async () => {
    try {
      const latest = await db.partyRegistry.findFirst({ orderBy: { checkedAt: "desc" }, select: { checkedAt: true } });
      const stale = !latest || Date.now() - new Date(latest.checkedAt).getTime() > 27 * 24 * 60 * 60 * 1000;
      if (!stale) return;
      const { refreshPartyRegistry } = await import("./src/lib/party-registry");
      const r = await refreshPartyRegistry();
      console.log(`> party registry refreshed: ${r.parties} parties, ${r.created} new, ${r.updated} updated, ${r.changes} changes${r.errors.length ? `, ${r.errors.length} errors` : ""}`);
    } catch (e) { console.warn("> party registry refresh failed", (e as Error)?.message); }
  };
  setInterval(refreshParties, 12 * 60 * 60 * 1000); // twice daily; acts only when stale
  setTimeout(refreshParties, 60 * 1000);            // once ~1 min after boot

  server.listen(port, () => console.log(`> Situation Room on http://localhost:${port} (Next + Socket.IO)`));
});
