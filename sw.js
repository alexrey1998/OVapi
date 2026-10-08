// Kill switch: replaces the old service worker, deletes its caches, unregisters itself and reloads the open pages,
// which then get the moving page from the network instead of the cached app.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("tplive-")).map((n) => caches.delete(n)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.navigate(c.url).catch(() => {}));
    })()
  );
});
