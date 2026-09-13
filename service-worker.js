const CACHE_NAME = "mrf-eko-cache-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./logo-mrf.jpeg",
  "./apple-touch-icon.png",
  "./icon-eko-192.png",
  "./icon-eko-512.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(error => console.warn("MRF EKO cache:", error))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key =>
              key.startsWith("mrf-eko-") &&
              key !== CACHE_NAME
            )
            .map(key => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", event => {

  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {

      try {

        // Quando c'è internet prende sempre
        // la versione più recente pubblicata.
        const response = await fetch(request, {
          cache: "no-store"
        });

        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }

        return response;

      } catch (error) {

        // Se non c'è internet usa l'ultima
        // versione salvata sul dispositivo.
        const cached = await caches.match(
          request,
          { ignoreSearch: true }
        );

        if (cached) return cached;

        if (request.mode === "navigate") {
          const fallback =
            await caches.match("./index.html");

          if (fallback) return fallback;
        }

        throw error;
      }
    })()
  );
});
