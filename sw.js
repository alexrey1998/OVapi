const CACHE_NAME = 'tp-live-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json'
  // Ajoutez ici d'autres ressources à mettre en cache si nécessaire, comme les icônes.
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  // Pour les requêtes de navigation et pour le fichier script.js, utiliser une stratégie réseau en priorité.
  if (event.request.mode === 'navigate' || event.request.url.endsWith('script.js')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Mettez à jour le cache avec la réponse fraîche
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Pour les autres ressources, utiliser le cache si disponible
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
  }
});
