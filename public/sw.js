// Self-unregistering no-op service worker.
// Prevents 404 compilation latency when browsers have a stale service worker
// registration on this origin, and cleanly removes the registration.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  self.registration
    .unregister()
    .then(() => self.clients.matchAll())
    .then((clients) => {
      for (const client of clients) {
        if (client.url && "navigate" in client) {
          client.navigate(client.url);
        }
      }
    });
});
