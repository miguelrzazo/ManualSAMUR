// Public static shell only. Publication verification and persistence belong to the app.
const CACHE_NAME = "samur-public-v4";
const STATIC_ASSETS = ["/", "/manual", "/codigos", "/vademecum", "/mapa", "/manifest.json"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.allSettled(STATIC_ASSETS.map(async (path) => {
    const response = await fetch(path);
    if (response.ok && response.type === "basic") await cache.put(path, response);
  }))));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  // Never cache editor pages, authenticated requests, or mutable/immutable API responses.
  // The verified complete snapshot is stored atomically in IndexedDB instead.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/gestion-editorial") || request.headers.has("Authorization")) return;
  const publicPath = /^\/(?:$|manual(?:\/|$)|codigos(?:\/|$)|vademecum(?:\/|$)|abreviaturas(?:\/|$)|mapa(?:\/|$)|acerca-de(?:\/|$)|cambios(?:\/|$)|privacidad(?:\/|$)|soporte(?:\/|$)|colaboradores(?:\/|$)|_next\/static\/|assets\/|icons\/|docs\/|images\/|favicon\.|apple-touch-icon\.|manifest\.json$)/;
  if (!publicPath.test(url.pathname)) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && response.type === "basic" && !/private|no-store/i.test(response.headers.get("Cache-Control") || "")) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || Response.error()));
});
