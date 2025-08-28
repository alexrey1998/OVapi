// sw.js — retour à une stratégie sans mise à jour automatique du CSS (cache-first)
const CACHE_VERSION = "tplive-static-v1";
const CACHE_NAME = `tplive-${CACHE_VERSION}`;

const PRECACHE = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/settings.js",
  "/colors.js",
  "/manifest.json",
  "/icons/icon-16.png",
  "/icons/icon-32.png",
  "/icons/logo.svg",
  "/swiss_stations.csv"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((n) => (n !== CACHE_NAME && n.startsWith("tplive-")) ? caches.delete(n) : Promise.resolve())
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Laisser passer les requêtes externes (API opendata.ch, etc.)
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first avec repli cache pour fonctionnement hors-ligne
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // Tous les autres assets du site (CSS, JS, images, CSV, manifest): cache-first
  event.respondWith(cacheFirst(req));
});

/* ---- stratégies ---- */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch (_) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    const root = await cache.match("/");
    if (root) return root;
    throw _;
  }
}
```0
