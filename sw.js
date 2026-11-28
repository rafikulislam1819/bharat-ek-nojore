const CACHE_NAME = 'bharat-app-v29';
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
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        CORE_ASSETS.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => (res && res.status === 200 ? cache.put(url, res) : null))
            .catch(() => {})
        )
      )
    )
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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // External APIs (Weather, Live Market, Fonts, Translate, Firebase): Network-First
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // HTML / App Shell Navigation: Network-First (always loads latest GitHub version immediately; falls back to cache offline)
  const isHtml = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (isHtml) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(req, { cache: 'no-store' })
          .then((res) => {
            if (res && res.status === 200) {
              cache.put(req, res.clone()).catch(() => {});
              if (req.mode === 'navigate') {
                cache.put('./index.html', res.clone()).catch(() => {});
              }
            }
            return res;
          })
          .catch(() =>
            cache.match(req, { ignoreSearch: true }).then((hit) => hit || cache.match('./index.html'))
          )
      )
    );
    return;
  }

  // Static Same-Origin Assets (Icons, Manifest): Cache-First with background refresh
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((cached) => {
        const netUpdate = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          })
          .catch(() => null);
        return cached || netUpdate;
      })
    )
  );
});
