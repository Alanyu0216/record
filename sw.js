'use strict';

// Cache only public application files. Financial data, API responses, attachments,
// and third-party CDN scripts are never stored by this service worker.
const CACHE = 'life-hub-shell-v2.0.0';
const FILES = ['index.html', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const urls = FILES.map(file => new URL(file, self.registration.scope).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('life-hub-shell-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const navigation = request.mode === 'navigate' && (url.href === self.registration.scope || url.href === new URL('index.html', self.registration.scope).href);
  if (!navigation && !urls.includes(url.href)) return;
  if (url.origin !== self.location.origin || url.search) return;
  const key = navigation ? new URL('index.html', self.registration.scope).href : url.href;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(key, copy)));
    }
    return response;
  }).catch(() => caches.match(key).then(cached => cached || Response.error())));
});
