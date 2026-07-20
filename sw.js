// Nomad — service worker
// Deliberately minimal: caches the static shell only, so the PWA installs
// and opens offline. Does NOT cache API/Supabase calls — those must always
// hit the network, since stale scores or transaction feeds during a live
// demo would be actively misleading.
//
// Registered from ONE place only (public/index.html) to avoid the classic
// dual-registration bug (e.g. /sw.js vs /service-worker.js both active at
// once) — don't add a second registerServiceWorker() call anywhere else.

const CACHE_NAME = "nomad-shell-v1";
const SHELL_ASSETS = [
  "/public/manifest.json",
  "/shared/styles/tokens.css",
  "/trader/trader.html",
  "/trader/trader.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache Supabase or any API traffic — always go to network.
  if (url.hostname.includes("supabase")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});