/* Apex PodPlay Helper — offline shell + fresh data.
 * Bump CACHE to force clients onto a new shell after a deploy. */
const CACHE = "apex-podplay-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;

  // HTML + data → network-first so code deploys and fresh data show on the next
  // load (not the one after); fall back to cache offline.
  if (req.mode === "navigate" || path.endsWith("/events.json") || path.endsWith("/index.html") || path.endsWith("/")) {
    e.respondWith(
      fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req).then((m) => m || caches.match("./index.html"))),
    );
    return;
  }

  // static assets (icon, manifest) → stale-while-revalidate: instant, refresh in background.
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return r;
      }).catch(() => cached);
      return cached || net;
    }),
  );
});
