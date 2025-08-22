// sw.js
const CACHE_NAME = 'tp-live-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './settings.js',
  './colors.js',
  './swiss_stations.csv',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first pour navigation et scripts modules principaux
  const isNav = event.request.mode === 'navigate';
  const isCoreScript = url.pathname.endsWith('/script.js') ||
                       url.pathname.endsWith('/settings.js') ||
                       url.pathname.endsWith('/colors.js');

  if (isNav || isCoreScript) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first pour le reste
    event.respondWith(
      caches.match(event.request).then(resp => resp || fetch(event.request))
    );
  }
});
