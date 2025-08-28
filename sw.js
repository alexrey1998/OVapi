// sw.js — cache avec stale-while-revalidate pour CSS et JS, sans versionnage d’URL
const CACHE_VERSION = "tplive-v5";
const CACHE_NAME = `tplive-${CACHE_VERSION}`;

// Précache minimal (pas de CSS/JS pour permettre la revalidation)
const PRECACHE = [
  "/",
  "/index.html",
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

  // Pages HTML (navigations): network-first
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // CSS: stale-while-revalidate
  if (req.destination === "style" || url.pathname.endsWith("/style.css")) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // JS applicatif: stale-while-revalidate
  if (
    req.destination === "script" &&
    (url.pathname.endsWith("/script.js") ||
     url.pathname.endsWith("/settings.js") ||
     url.pathname.endsWith("/colors.js"))
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Images/icônes: cache-first
  if (req.destination === "image" || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Par défaut: network-first
  event.respondWith(networkFirst(req));
});

/* ----- Strategies ----- */
async function cachePut(req, res) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(req, res.clone());
  } catch (_) {}
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cachePut(req, res);
      return res;
    })
    .catch(() => null);
  return cached || fetchPromise || fetch(req);
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) cachePut(req, res);
    return res;
  } catch (_) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === "navigate") {
      const root = await cache.match("/");
      if (root) return root;
    }
    throw _;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) cachePut(req, res);
  return res;
}
