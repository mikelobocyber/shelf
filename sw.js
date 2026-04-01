// ── sw.js — Service Worker ──
// Caches the app shell (HTML, CSS, JS, and CDN libraries) so Shelf works
// completely offline after the first load. This is what allows the browser
// "Add to Home Screen" / "Install app" feature to work on iPad and desktop.
//
// Strategy: Cache-first for app shell assets, network-first for CDN scripts
// (so updates to epub.js / PDF.js are picked up when online).

const CACHE_NAME = 'shelf-v1';

// App shell — all local files that make up the UI
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/library.css',
  './css/reader.css',
  './js/db.js',
  './js/library.js',
  './js/reader.js',
  './js/theme.js',
  './js/toc-bookmarks.js',
  './js/shelf-folder.js',
  './js/app.js',
];

// CDN scripts — cached on first fetch, updated when online
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];

// ── Install: pre-cache the app shell ─────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache shell assets — fail silently on individual errors
      // so a missing icon doesn't block the whole install
      return Promise.allSettled(
        [...SHELL_ASSETS, ...CDN_ASSETS].map(url =>
          cache.add(url).catch(err =>
            console.warn('SW: could not cache', url, err)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fall back to network ─────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests; skip non-http (e.g. chrome-extension://)
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache the response
      return fetch(event.request).then(response => {
        // Only cache valid responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline and not cached — return a minimal offline page for HTML requests
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return new Response(
            '<html><body style="background:#111;color:#c9aa70;font-family:Georgia;' +
            'display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
            '<p>Shelf is offline. Open the app first while online to cache it.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        }
      });
    })
  );
});
