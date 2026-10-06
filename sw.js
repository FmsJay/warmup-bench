/* Offline: the app shell and the piano are cached on first visit, so a warm-up works with no
   signal. Bump VERSION whenever any cached file changes, or phones keep the old one. */
const VERSION = "wb-6";
const SHELL = ["./", "index.html", "styles.css?v=6", "manifest.webmanifest", "js/core.js?v=6", "js/library.js?v=6", "js/audio.js?v=6", "js/mylib.js?v=6", "js/app.js?v=6", "icons/icon-192.png"];
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    // no piano here: the sampled piano lives in the user's own Drive, not in the public app
    self.skipWaiting();
  })());
});
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  self.clients.claim();
})()));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.pathname.includes("/api/") || e.request.method !== "GET") return;   // never cache the coach
  e.respondWith((async () => {
    const hit = await caches.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try { const r = await fetch(e.request); if (r.ok && u.origin === location.origin) (await caches.open(VERSION)).put(e.request, r.clone()); return r; }
    catch (err) { return (await caches.match("index.html")) || Response.error(); }
  })());
});
