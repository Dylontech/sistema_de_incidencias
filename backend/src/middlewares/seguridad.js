/**
 * Cabeceras de seguridad HTTP.
 *
 * La política de contenidos se arma aquí en lugar de aceptar los valores por
 * omisión de helmet porque la aplicación tiene necesidades propias:
 *
 *   - El mapa carga teselas de Esri y OpenTopoMap (imágenes de terceros).
 *   - Las previsualizaciones locales de evidencia usan `data:`.
 *   - NO se admite nada en línea: todo el CSS vive en archivos y los valores
 *     dinámicos (colores de zonas, posición del tutorial…) se aplican por CSSOM
 *     (`el.style.setProperty`), que la CSP sí permite.
 *
 * `styleSrcAttr: 'none'` es la parte estricta: bloquea los atributos `style="…"`
 * del marcado. Por eso el frontend no puede volver a introducirlos (hay una
 * prueba que lo comprueba: test/sin-estilos-inline.test.js).
 */
import helmet from 'helmet';
import { config, esProduccion } from '../config/index.js';

/** Teselas del mapa (ver frontend/js/map/mapa.js). */
const TESELAS = ['https://server.arcgisonline.com', 'https://*.tile.opentopomap.org'];

/**
 * Servidor local de PMTiles de la app de escritorio.
 * Solo escucha en loopback; el paquete se genera con datos ODbL y nunca se
 * descargan teselas de los servidores públicos de OSM.
 */
const MAPAS_LOCALES = 'http://127.0.0.1:*';

/** Directivas de la CSP, según el entorno. Exportada para poder probarla. */
export function directivasCsp() {
  const laxo = config.seguridad.cspModo === 'laxo';
  const https = config.seguridad.asumirHttps;

  const directivas = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    scriptSrc: ["'self'"],
    // La interfaz no usa manejadores en línea: va por delegación de eventos
    // con atributos data-action/data-change/…
    scriptSrcAttr: ["'none'"],
    styleSrc: laxo ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    styleSrcAttr: laxo ? ["'unsafe-inline'"] : ["'none'"],
    // `blob:` es necesario para la vista previa de la foto tomada con la cámara
    // (canvas → File/objeto URL).
    imgSrc: ["'self'", 'data:', 'blob:', ...TESELAS, MAPAS_LOCALES],
    fontSrc: ["'self'"],
    connectSrc: ["'self'", MAPAS_LOCALES],
    objectSrc: ["'none'"],
    // El visor de informes usa un iframe con un blob local para el PDF.
    frameSrc: ["'self'", 'blob:'],
    childSrc: ["'self'", 'blob:'],
    // El service worker del modo offline (fase 4) se sirve desde el propio
    // origen; sin esta directiva el navegador no lo registra.
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"]
  };

  // Solo con HTTPS delante: en HTTP a secas el navegador intentaría subir a
  // https también los recursos propios y la interfaz se quedaría sin estilos.
  if (https) directivas.upgradeInsecureRequests = [];

  return directivas;
}

/** Middleware con todas las cabeceras de seguridad. */
export function cabecerasSeguridad() {
  return helmet({
    contentSecurityPolicy: { useDefaults: false, directives: directivasCsp() },
    strictTransportSecurity: esProduccion() && config.seguridad.asumirHttps
      ? { maxAge: 15552000, includeSubDomains: true }
      : false,
    // COEP rompería las teselas del mapa y no aporta nada aquí.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' }
  });
}

/**
 * Permissions-Policy: la aplicación pide la ubicación («Usar mi ubicación») y
 * la cámara («Tomar foto») al navegador, así que ambas se permiten solo para
 * el propio origen; el resto de capacidades se apagan.
 */
export function permisosDelNavegador(req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(self), camera=(self), microphone=(), payment=(), usb=(), serial=()'
  );
  next();
}

/**
 * Cabeceras para la evidencia servida en /uploads.
 *
 * Es un archivo que sube el usuario, así que se sirve con lo mínimo: nada de
 * ejecutar nada si alguien abre la URL directamente (un SVG o un HTML colado
 * se quedaría sin scripts y en un origen único por `sandbox`).
 */
export function cabecerasEvidencia(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  next();
}
