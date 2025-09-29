// sw.js — Option B: CSS/JS en network-first (fallback cache), pas de versionnage d'URL
const CACHE_VERSION = "tplive-V_2025.09.29_23.53";
const CACHE_NAME = `tplive-${CACHE_VERSION}`;

// Précache minimal (pas de CSS/JS pour permettre revalidation)
const PRECACHE = [
  "index.html",
  "manifest.json",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/logo.svg",
  "swiss_stations.csv"
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

  // Ne gère que même origine
  if (url.origin !== self.location.origin) return;

  // Pages HTML (navigation): network-first
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // CSS: network-first
  if (req.destination === "style" || url.pathname.endsWith("style.css")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // JS applicatif: network-first
  if (
    req.destination === "script" &&
    (url.pathname.endsWith("script.js") ||
     url.pathname.endsWith("settings.js") ||
     url.pathname.endsWith("colors.js"))
  ) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Images/icônes: cache-first
  if (req.destination === "image" || url.pathname.includes("/icons/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Par défaut: network-first
  event.respondWith(networkFirst(req));
});

/* ---- stratégies ---- */
async function cachePut(req, res) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(req, res.clone());
  } catch (_) {}
}

async function networkFirst(req) {
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (res && res.ok) cachePut(req, res);
    return res;
  } catch (_) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === "navigate") {
      const root = await cache.match("index.html");
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