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
    imgSrc: ["'self'", 'data:', ...TESELAS],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameSrc: ["'none'"],
    childSrc: ["'none'"],
    workerSrc: ["'none'"],
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
 * Permissions-Policy: la aplicación pide la ubicación al navegador («Usar mi
 * ubicación»), así que geolocation se permite solo para el propio origen y el
 * resto de capacidades se apagan.
 */
export function permisosDelNavegador(req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), serial=()'
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
