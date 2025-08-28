// sw.js — cache avec stale-while-revalidate pour style.css et JS
const CACHE_VERSION = "tplive-v4";
const CACHE_NAME = `tplive-${CACHE_VERSION}`;

// Fichiers précachés (hors CSS/JS pour permettre la revalidation)
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
      await Promise.all(names.map(n => (n !== CACHE_NAME && n.startsWith("tplive-")) ? caches.delete(n) : Promise.resolve()));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Laisser passer les requêtes externes (API opendata.ch, etc.)
  if (url.origin !== self.location.origin) return;

  // Pages HTML (navigation) : network-first
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // CSS principal : stale-while-revalidate
  if (req.destination === "style" || url.pathname.endsWith("/style.css")) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // JS de l'app : stale-while-revalidate (script.js, settings.js, colors.js)
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

/* ---- Strategies ---- */
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
    // Fallback minimal vers la racine en cas de navigation hors-ligne
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
