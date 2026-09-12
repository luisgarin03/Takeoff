// Installability-only service worker. Network is always authoritative: no
// cache is created for the app shell, PDFs, project data, or API responses.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
