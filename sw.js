const CACHE = 'cabinet-shell-v39';
const ASSETS = ['./','./index.html','./styles.css','./ink.css','./app.js','./scene.js','./pages.js','./pen.js','./sound.js','./storage.js','./security.js','./editor.js','./settings.js','./manifest.json','./icon.jpg','./icon.svg','./painting-ruisdael-1646.jpg','./vendor/three.module.js','./vendor/three.core.js','./vendor/RoundedBoxGeometry.js'];
const SHELL_PATHS = new Set(ASSETS.map(asset => new URL(asset, self.location.href).pathname));
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith('cabinet-shell-') && key !== CACHE) await caches.delete(key); await self.clients.claim(); })()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !SHELL_PATHS.has(url.pathname)) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    return fetch(event.request);
  })());
});
