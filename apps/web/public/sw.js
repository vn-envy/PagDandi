/* PagDandi service worker — the app shell and the Trek Pack work in airplane mode.
 *
 * Strategy:
 *  - Trek Pack files + static assets: cache-first (immutable content)
 *  - .pmtiles: full file cached once; Range requests answered with 206 slices
 *    (the pmtiles protocol reads byte ranges — Cache API alone can't serve them)
 *  - navigations: network-first, offline fallback to cached shell
 *  - /api and /humsafar: never intercepted (local Gemma server handles them)
 */

const CACHE = "pagdandi-v1";

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/trek-packs/triund/manifest.json",
  "/trek-packs/triund/trail.geojson",
  "/trek-packs/triund/pois.geojson",
  "/trek-packs/triund/almanac.md",
  "/trek-packs/triund/triund.pmtiles",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // Individually, so one miss doesn't sink the install
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

async function rangeSlice(request, fullResponse) {
  const rangeHeader = request.headers.get("range");
  const m = /bytes=(\d+)-(\d+)?/.exec(rangeHeader || "");
  if (!m) return fullResponse;
  const buf = await fullResponse.arrayBuffer();
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
  if (start >= buf.byteLength) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${buf.byteLength}` },
    });
  }
  const slice = buf.slice(start, end + 1);
  return new Response(slice, {
    status: 206,
    headers: {
      "Content-Type": fullResponse.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`,
      "Content-Length": String(slice.byteLength),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // basemap sprites/fonts: browser cache
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/humsafar") || url.pathname === "/health") {
    return; // live local server traffic
  }

  // PMTiles: serve byte ranges from the cached full file
  if (url.pathname.endsWith(".pmtiles")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        let full = await cache.match(url.pathname, { ignoreSearch: true });
        if (!full) {
          try {
            full = await fetch(url.pathname);
            if (full.ok) await cache.put(url.pathname, full.clone());
          } catch {
            return new Response(null, { status: 504 });
          }
        }
        return req.headers.has("range") ? rangeSlice(req, full.clone()) : full.clone();
      })(),
    );
    return;
  }

  // App shell navigations: network-first, cached shell offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(async () => (await caches.match("/")) || Response.error()),
    );
    return;
  }

  // Everything else (trek pack JSON, /_next/static, fonts): cache-first
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith("/trek-packs/") || url.pathname.startsWith("/_next/static/"))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }),
    ),
  );
});
