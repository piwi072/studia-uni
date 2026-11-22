const CACHE_NAME = 'studia-pwa-v8';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache Google OAuth, Calendar/Drive/Gemini APIs, or Personal Apps Script Bridge
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com')
  ) {
    return;
  }

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      const hasShareParams =
        url.searchParams.has('share_title') ||
        url.searchParams.has('share_text') ||
        url.searchParams.has('share_url');
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (!hasShareParams && response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
            }
            return response;
          })
          .catch(() => caches.match('./index.html'))
      );
      return;
    }

    event.respondWith(
      caches.match(request).then((cached) => {
        const fetched = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetched;
      })
    );
  }
});
