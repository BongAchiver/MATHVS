const CACHE = "mathvs-v3";
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch("/");
      const html = await response.text();
      const assets = [
        ...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g),
      ].map((m) => m[1]);
      await cache.addAll([
        "/",
        "/favicon.svg",
        "/art/arena-portrait.png",
        "/fonts/oswald.ttf",
        "/audio/ui-press-v2.wav",
        ...assets,
      ]);
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/socket.io")
  )
    return;
  // Network-first HTML ensures deployments refresh; hashed assets remain safe to cache.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        return (
          (await cache.match(event.request)) ||
          (event.request.mode === "navigate"
            ? await cache.match("/")
            : Response.error())
        );
      }
    })(),
  );
});
