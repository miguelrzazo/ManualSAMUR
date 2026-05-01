// SAMUR Manual — Service Worker
// Simple caching strategy: network-first for pages, cache-first for assets and map tiles.

const CACHE_NAME = "samur-v1";
const MAP_CACHE = "samur-map-v1";
const STATIC_ASSETS = ["/", "/manual", "/codigos", "/vademecum", "/mapa", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== MAP_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Cache map tiles (CartoCDN)
  if (url.hostname.includes("cartocdn.com") || url.hostname.includes("cartodb.com")) {
    event.respondWith(
      caches.open(MAP_CACHE).then((cache) =>
        cache.match(event.request).then(
          (cached) =>
            cached ||
            fetch(event.request).then((res) => {
              if (res.ok) cache.put(event.request, res.clone());
              return res;
            })
        )
      )
    );
    return;
  }

  // Network-first for same-origin pages/API
  if (url.origin === location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
});
