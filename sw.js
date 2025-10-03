// sw.js
const CACHE_VERSION = "tplive-V_2025.10.01.12.12";
const CACHE_NAME = `tplive-${CACHE_VERSION}`;
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

  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  if (req.destination === "style" || url.pathname.endsWith("style.css")) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (
    req.destination === "script" &&
    (url.pathname.endsWith("script.js") ||
     url.pathname.endsWith("settings.js") ||
     url.pathname.endsWith("colors.js"))
  ) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (req.destination === "image" || url.pathname.includes("/icons/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(networkFirst(req));
});

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