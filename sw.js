const CACHE_NAME = 'bharat-app-v23';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './privacy-policy.html',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // External APIs (Weather, Live Market, Fonts, Translate, Firebase): network-first, never block app shell
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Same-origin App Shell (HTML, Icons, Manifest, Privacy Policy):
  // Instant Cache-First (opens in <0.3s!) + Silent Background Update (Stale-While-Revalidate)
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((cached) => {
        const fallback = cached
          ? Promise.resolve(cached)
          : (req.mode === 'navigate' ? cache.match('./index.html') : Promise.resolve(undefined));

        const netUpdate = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              cache.put(req, res.clone()).catch(() => {});
              if (req.mode === 'navigate') {
                cache.put('./index.html', res.clone()).catch(() => {});
              }
            }
            return res;
          })
          .catch(() => null);

        return fallback.then((hit) => hit || netUpdate);
      })
    )
  );
});
