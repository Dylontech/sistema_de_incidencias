/**
 * Service worker del modo offline.
 *
 * Cachea el armazón de la aplicación (HTML, CSS, JS y Leaflet) para que el
 * formulario abra sin red. La API y las evidencias nunca se cachean: los
 * reportes se guardan en la cola de IndexedDB (js/core/offline.js).
 */
const CACHE = 'incidencias-shell-v2.9.1';
const SHELL = [
  '/',
  '/index.html',
  '/personal.html',
  '/css/base.css',
  '/css/layout.css',
  '/css/componentes.css',
  '/css/admin.css',
  '/css/reportes.css',
  '/css/extensiones.css',
  '/css/publicidad-estudio.css',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/leaflet.js',
  '/js/main.js',
  '/js/data/plantillas-publicidad.js',
  '/js/views/diseno-publicidad.js',
  '/js/views/publicidad.view.js',
  '/js/controllers/publicidad.controller.js',
  '/js/controllers/qr.controller.js',
  '/js/services/publicidad.service.js',
  '/js/controllers/comunicacion.controller.js',
  '/js/services/contactos-funcionarios.service.js',
  '/js/views/campanas.view.js',
  '/js/controllers/campanas.controller.js'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  evento.respondWith(
    fetch(evento.request)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(evento.request, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(evento.request).then((guardada) => guardada || caches.match('/')))
  );
});
