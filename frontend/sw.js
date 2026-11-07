/**
 * Service worker del modo offline.
 *
 * Cachea el armazón de la aplicación (HTML, CSS, JS y Leaflet) para que el
 * formulario abra sin red. La API y las evidencias nunca se cachean: los
 * reportes se guardan en la cola de IndexedDB (js/core/offline.js).
 */
const CACHE = 'incidencias-shell-v2.17.0';
/**
 * Caché de teselas descargadas por el usuario desde «Descargar mapa».
 * Es independiente del armazón: `activate` no debe borrarla.
 */
const CACHE_TESELAS = 'inc-teselas-v1';
const HOSTS_TESELAS = ['server.arcgisonline.com', 'tile.opentopomap.org'];
const SHELL = [
  '/',
  '/index.html',
  '/personal.html',
  '/cuenta.html',
  '/css/base.css',
  '/css/layout.css',
  '/css/componentes.css',
  '/css/admin.css',
  '/css/reportes.css',
  '/css/extensiones.css',
  '/css/publicidad-estudio.css',
  '/css/legibilidad.css',
  '/css/impresion-informe.css',
  '/fonts/SourceSans3-Regular.woff2',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/leaflet.js',
  '/js/main.js',
  '/js/cuenta.js',
  '/js/core/selector-territorial-bloques.js',
  '/js/core/correo-cuenta.js',
  '/js/core/visor-adjunto.js',
  '/js/data/permisos.js',
  '/js/data/permisos-ayuda.js',
  '/js/data/plantillas-publicidad.js',
  '/js/views/diseno-publicidad.js',
  '/js/views/publicidad.view.js',
  '/js/controllers/publicidad.controller.js',
  '/js/controllers/qr.controller.js',
  '/js/services/publicidad.service.js',
  '/js/controllers/comunicacion.controller.js',
  '/js/controllers/ticketsModal.controller.js',
  '/js/controllers/ticketsAtencion.controller.js',
  '/js/services/tickets.service.js',
  '/js/services/reparaciones.service.js',
  '/js/views/reparaciones.view.js',
  '/js/services/vialidades.service.js',
  '/js/views/vialidades.view.js',
  '/js/controllers/vialidades.controller.js',
  '/js/services/contactos-funcionarios.service.js',
  '/js/services/bloqueos.service.js',
  '/js/services/reportes-conversacion.service.js',
  '/js/services/reclamaciones.service.js',
  '/js/controllers/reclamaciones.controller.js',
  '/js/map/teselas.js',
  '/js/map/vialidades.js',
  '/js/map/mapa-offline.js',
  '/js/controllers/mapas.controller.js',
  '/js/controllers/reportes.controller.js',
  '/js/controllers/versionPdf.controller.js',
  '/js/views/reportes.view.js',
  '/js/views/graficos-svg.js',
  '/js/views/campanas.view.js',
  '/js/controllers/campanas.controller.js',
  '/js/controllers/verificacion.controller.js',
  '/js/views/verificacion.view.js'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((c) => c !== CACHE && c !== CACHE_TESELAS)
            .map((c) => caches.delete(c))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);

  // Teselas del mapa descargadas: primero la caché del municipio, luego la red.
  if (evento.request.method === 'GET' && HOSTS_TESELAS.includes(url.hostname)) {
    evento.respondWith(
      caches.open(CACHE_TESELAS).then(async (cache) => {
        const guardada = await cache.match(evento.request, { ignoreVary: true });
        if (guardada) return guardada;
        return fetch(evento.request);
      })
    );
    return;
  }

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
