"use client";
import { openDB, type IDBPDatabase } from "idb";
import { api } from "./session";

export type OutboxMedia = { blob: Blob; mime: string; kind: string; sheetSigned?: boolean; durationSec?: number };
export type OutboxItem = {
  clientUid: string;
  body: any;               // submission body (without media urls)
  media: OutboxMedia[];
  createdAt: number;
  tries: number;
  lastError?: string;
};

let dbp: Promise<IDBPDatabase> | null = null;
function getDb() {
  if (!dbp) dbp = openDB("psr", 1, { upgrade(d) { d.createObjectStore("outbox", { keyPath: "clientUid" }); } });
  return dbp;
}

const listeners = new Set<() => void>();
export function onOutboxChange(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }
function notify() { listeners.forEach((l) => l()); }

export async function enqueue(item: OutboxItem) {
  const d = await getDb();
  await d.put("outbox", item);
  notify();
  void drain();
}

export async function count(): Promise<number> {
  const d = await getDb();
  return d.count("outbox");
}

export async function all(): Promise<OutboxItem[]> {
  const d = await getDb();
  return (await d.getAll("outbox")) as OutboxItem[];
}

let draining = false;
export async function drain(): Promise<void> {
  // Only guard against concurrent drains. We do NOT check navigator.onLine —
  // it's unreliable in PWAs; if we're actually offline the fetch just fails and
  // the item stays queued (tries++). This makes "Sync now" always attempt.
  if (draining) return;
  draining = true;
  try {
    const d = await getDb();
    const items = (await d.getAll("outbox")) as OutboxItem[];
    for (const item of items) {
      try {
        // 1) upload any media, collect urls. A permanent upload failure (e.g. a
        // too-large or unsupported result-sheet photo → 4xx) must NOT block the
        // whole submission forever: skip that attachment and still deliver the
        // scores/text. Only transient failures (5xx/offline) retry.
        const media: any[] = [];
        for (const m of item.media) {
          const fd = new FormData();
          fd.append("file", m.blob, `f.${m.mime.split("/")[1] || "bin"}`);
          const up = await api("/api/upload", { method: "POST", body: fd });
          if (up.ok) {
            const j = await up.json();
            media.push({ url: j.url, mime: j.mime, size: j.size, kind: m.kind, sheetSigned: m.sheetSigned, durationSec: m.durationSec });
          } else if (up.status >= 400 && up.status < 500 && up.status !== 401 && up.status !== 429) {
            continue; // permanent — drop this attachment, keep going
          } else {
            throw new Error(`upload ${up.status}`); // transient — retry whole item
          }
        }
        // 2) post the submission. clientUid lives at the ITEM level (not in
        // body) and the server requires it for idempotency — include it here.
        const res = await api("/api/submissions", { method: "POST", body: JSON.stringify({ clientUid: item.clientUid, ...item.body, media }) });
        if (res.ok || res.status === 409) {
          await d.delete("outbox", item.clientUid);          // sent (or duplicate)
        } else if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429) {
          // Permanent client error (e.g. malformed 400/422): retrying will never
          // succeed, so drop it instead of blocking the queue forever.
          await d.delete("outbox", item.clientUid);
        } else {
          throw new Error(`submit ${res.status}`);            // transient (401/429/5xx/offline) → retry
        }
      } catch (e: any) {
        item.tries += 1; item.lastError = String(e?.message || e);
        await d.put("outbox", item);
      }
    }
  } finally {
    draining = false;
    notify();
  }
}

// Foreground retry loop (fallback for browsers without Background Sync).
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void drain());
  setInterval(() => void drain(), 20000);
}
