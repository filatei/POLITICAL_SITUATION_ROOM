import { NextRequest } from "next/server";
import { getSession, requireRole } from "@/lib/auth";
import { subscribe } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN", "COORDINATOR", "ANALYST"]))
    return new Response("Forbidden", { status: 403 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (e: unknown) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch {}
      };
      send({ kind: "ping", payload: "connected", at: new Date().toISOString() });
      const unsub = subscribe(send);
      const hb = setInterval(() => {
        try { controller.enqueue(enc.encode(`: hb\n\n`)); } catch {}
      }, 15000);
      req.signal.addEventListener("abort", () => {
        clearInterval(hb); unsub(); try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
