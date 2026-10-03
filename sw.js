// Service worker del Reporteador GC.
// Objetivo: que sea instalable como app y que abra rápido. NUNCA guarda datos del
// inventario ni de ventas: las llamadas al API (POST al Worker) no pasan por aquí.
const VERSION = 'reporteador-v10';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // POST al API: no se toca
  const url = new URL(req.url);
  if (url.hostname.endsWith('workers.dev')) return;       // API: siempre directo a la red

  // Páginas: primero red (así siempre ves la versión más nueva); sin red, la guardada.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(resp => { const copia = resp.clone(); caches.open(VERSION).then(c => c.put(req, copia)); return resp; })
        .catch(() => caches.match(req).then(r => r || caches.match('index.html') || caches.match('./')))
    );
    return;
  }

  // Archivos estáticos (propios y de los CDN): usa lo guardado y lo refresca en segundo plano.
  e.respondWith(
    caches.match(req).then(cacheado => {
      const red = fetch(req).then(resp => {
        if (resp && (resp.ok || resp.type === 'opaque')) {
          const copia = resp.clone();
          caches.open(VERSION).then(c => c.put(req, copia));
        }
        return resp;
      }).catch(() => cacheado);
      return cacheado || red;
    })
  );
});
