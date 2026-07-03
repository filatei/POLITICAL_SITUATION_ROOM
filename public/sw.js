// PWA service worker: fresh-first app shell so an installed PWA auto-updates on
// open, with an offline fallback. Static assets stay cache-first for speed.
const CACHE = "psr-shell-v3";
const SHELL = ["/", "/agent", "/agent/login", "/room", "/admin", "/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isNavigation(req) {
  return req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                 // never cache POSTs (submissions)
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;      // always hit network for API

  // Navigations (the HTML app shell): network-first so a new build is picked up
  // the moment the PWA is opened online; fall back to cache when offline.
  if (isNavigation(req)) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  // Everything else (static assets): cache-first, then network.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("/")))
  );
});

// Background Sync: tell open clients to drain the outbox.
self.addEventListener("sync", (e) => {
  if (e.tag === "psr-outbox") {
    e.waitUntil(self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage({ type: "drain" }))));
  }
});
