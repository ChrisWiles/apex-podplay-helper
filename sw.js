/* Apex PodPlay Helper — offline shell + fresh data.
 * Bump CACHE to force clients onto a new shell after a deploy. */
const CACHE = "apex-podplay-v1";
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

  // events.json → network-first so data is fresh online, cached copy offline.
  if (new URL(req.url).pathname.endsWith("/events.json")) {
    e.respondWith(
      fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req)),
    );
    return;
  }

  // everything else (shell) → stale-while-revalidate: instant load, refresh in background.
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
