// Turdle service worker: lets the installed app open offline.
// Network-first for everything, so new daily puzzles and site updates always win;
// the cache is only a fallback when offline. Bump CACHE to drop old caches.
const CACHE = 'turdle-v5';
const PRECACHE = [
  './', 'index.html', 'css/styles.css', 'js/app.js', 'puzzles.txt', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'dictionaries/dictionary-3.txt', 'dictionaries/dictionary-4.txt', 'dictionaries/dictionary-5.txt', 'dictionaries/dictionary-6.txt',
  'dictionaries/common-3.txt', 'dictionaries/common-4.txt', 'dictionaries/common-5.txt', 'dictionaries/common-6.txt'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  // Audio/video players fetch in byte ranges; leave those to the browser (iOS needs the 206 replies)
  if (req.headers.has('range')) return;
  // Our own files: revalidate with the server every time (a cheap 304 if unchanged) instead of
  // trusting the browser's 10-minute HTTP cache, which could pair a new page with an old app.js.
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  event.respondWith(
    // (a new Request from the URL: page navigations can't be re-fetched with options)
    fetch(sameOrigin ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : req)
      .then(res => {
        // Cache successful same-origin responses and the CDN fonts/scripts (opaque) for offline use
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});
