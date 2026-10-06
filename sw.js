/* Offline support. NETWORK FIRST for the app itself, so an update shows up on the next open
   whenever there's signal; the cache only answers when the network can't. (Cache-first kept
   phones on an old version after every release.) Bump VERSION when the file list changes. */
const VERSION = "wb-7";
const SHELL = ["./", "index.html", "styles.css?v=7", "manifest.webmanifest", "js/core.js?v=7", "js/library.js?v=7", "js/audio.js?v=7", "js/mylib.js?v=7", "js/app.js?v=7", "icons/icon-192.png"];
self.addEventListener("install", e => {
  e.waitUntil((async () => { const c = await caches.open(VERSION); await c.addAll(SHELL); self.skipWaiting(); })());
});
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.includes("/api/")) return;
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request, { cache: "no-cache" });
      if (r.ok) (await caches.open(VERSION)).put(e.request, r.clone());
      return r;
    } catch (err) {
      return (await caches.match(e.request, { ignoreSearch: false })) || (await caches.match(e.request, { ignoreSearch: true })) || (await caches.match("index.html")) || Response.error();
    }
  })());
});
