const CACHE = 'ft-v142';
const SHELL = [
  './build-id.js',
  './lock.html',
  './index.html',
  './styles/fonts.css',
  './styles/reset.css',
  './styles/tokens.css',
  './styles/base.css',
  './styles/components.css',
  './styles/mobile.css',
  './theme-modern.css',
  './assets/brand-logo.svg',
  './assets/ft-icons.svg',
  './assets/fonts/plus-jakarta-sans-400.woff2',
  './assets/fonts/plus-jakarta-sans-500.woff2',
  './assets/fonts/plus-jakarta-sans-600.woff2',
  './assets/fonts/plus-jakarta-sans-700.woff2',
  './assets/fonts/plus-jakarta-sans-800.woff2',
  './icons/icon192.png',
  './icons/icon512.png',
  './shared/main.js',
  './shared/core/index.js',
  './shared/core/format.js',
  './shared/core/dom.js',
  './shared/core/dates.js',
  './shared/app.js',
  './shared/features.js',
  './shared/extras.js',
  './shared/sync.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(SHELL.map(url =>
        cache.add(url).catch(err => console.warn('SW: failed to cache', url, err))
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  if (url.includes('script.google.com') || url.includes('googleapis.com')) {
    e.respondWith(fetch(req).catch(() => new Response('', { status: 503 })));
    return;
  }

  const accept = req.headers.get('accept') || '';
  const isHtml = req.mode === 'navigate' ||
                 accept.includes('text/html') ||
                 url.endsWith('.html');

  if (isHtml) {
    // Network-first: HTML updates are picked up the moment the device is online.
    e.respondWith(
      fetch(req).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first with background refresh for static assets (JS/CSS/icons).
  e.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() => null);
      return cached || networkFetch.then(r => r || caches.match('./index.html'));
    })
  );
});
