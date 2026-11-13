// Service worker del Reporteador GC.
// Objetivo: que sea instalable como app y que abra rápido. NUNCA guarda datos del
// inventario ni de ventas: las llamadas al API (POST al Worker) no pasan por aquí.
const VERSION = 'reporteador-v93';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon.svg', 'favicon-32.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'talleres.js', 'exportar.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

// Solo se borra el caché anterior si el nuevo ya tiene la página principal; si la instalación
// ocurrió con señal mala, se conserva el viejo para que la app siga abriendo sin conexión.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.match('index.html'))
      .then(listo => listo ? caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))) : null)
      .then(() => self.clients.claim())
  );
});

// Espera máxima a la red al abrir la app: con datos móviles flojos o bloqueados no se queda colgada.
function conTimeout(promesa, ms) {
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('timeout')), ms);
    promesa.then(v => { clearTimeout(t); ok(v); }, err => { clearTimeout(t); fail(err); });
  });
}

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // POST al API: no se toca
  const url = new URL(req.url);
  if (url.pathname.endsWith('/favicon.ico')) return;       // el ícono del sitio lo pide el navegador directo a la red
  if (url.hostname.endsWith('workers.dev')) return;       // API: siempre directo a la red

  // Páginas: primero red (así ves la versión más nueva) pero esperando máximo 4 s; si la red no
  // responde a tiempo o falla, se abre la copia guardada (la misma que se usa sin conexión).
  if (req.mode === 'navigate') {
    e.respondWith(
      conTimeout(fetch(req), 4000)
        .then(resp => { const copia = resp.clone(); caches.open(VERSION).then(c => c.put(req, copia)); return resp; })
        .catch(() => caches.match(req)
          .then(r => r || caches.match('index.html'))
          .then(r => r || caches.match('./')))
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
