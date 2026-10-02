// After any code change, set the date-time here (V_YYYY.MM.DD.HH.MM) and the same value without "V_" in both ?v= of index.html.
const CACHE_VERSION = "V_2026.10.02.04.00";
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

  const isImage = req.mode !== "navigate" && (req.destination === "image" || url.pathname.includes("/icons/"));
  // The stations CSV rarely changes: served from the cache, which is renewed with each new version (CACHE_VERSION).
  const isStationsList = url.pathname.endsWith("/swiss_stations.csv");
  event.respondWith(isImage || isStationsList ? cacheFirst(req) : networkFirst(req));
});

async function cachePut(req, res) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(req, res);
  } catch {}
}

async function networkFirst(req) {
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (res.ok) cachePut(req, res.clone());
    return res;
  } catch (err) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === "navigate") {
      const root = await cache.match("index.html");
      if (root) return root;
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cachePut(req, res.clone());
  return res;
}