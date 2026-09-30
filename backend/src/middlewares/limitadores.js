/**
 * Límites de peticiones (rate limiting).
 *
 * Objetivo: que las rutas de entrada no se puedan probar a fuerza bruta y que
 * una sesión (o una IP) no pueda inundar la API ni llenar el disco de evidencia.
 *
 * La clave es el `userKey` de la sesión cuando existe —así el límite sigue a la
 * cuenta aunque cambie de red— y la IP en caso contrario. Para las IP se usa el
 * ayudante `ipKeyGenerator` de la propia librería, que agrupa bien las IPv6.
 *
 * El almacén es en memoria: correcto con una sola instancia. Con varias réplicas
 * haría falta un almacén compartido (Redis) o cada réplica llevaría su cuenta.
 */
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { config } from '../config/index.js';

/** Respuesta uniforme de la API: { error, detalles }. */
function responder429(req, res) {
  const reintentar = res.getHeader('Retry-After');
  res.status(429).json({
    error: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.',
    detalles: reintentar
      ? [{ campo: 'retryAfter', mensaje: `Puedes reintentarlo en ${reintentar} s` }]
      : null
  });
}

/**
 * Crea un limitador.
 *
 * @param {object} opciones
 * @param {number} opciones.max            peticiones permitidas por ventana
 * @param {number} [opciones.ventanaMs]    duración de la ventana
 * @param {boolean} [opciones.porCuenta]   usa el userKey de la sesión como clave
 * @param {boolean} [opciones.saltarExitosas] no cuenta las respuestas correctas
 */
export function crearLimitador({
  max,
  ventanaMs = config.seguridad.rateLimit.ventanaMs,
  porCuenta = false,
  saltarExitosas = false
}) {
  // Con el límite apagado (y en las pruebas) el middleware deja pasar todo.
  if (!config.seguridad.rateLimit.activo) {
    return (req, res, next) => next();
  }

  return rateLimit({
    windowMs: ventanaMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: saltarExitosas,
    keyGenerator: (req) =>
      porCuenta && req.usuario?.userKey ? req.usuario.userKey : ipKeyGenerator(req.ip || ''),
    handler: responder429
  });
}

/* ---------------------------------------------------------------------------
 * Instancias concretas (una por política, para que compartan el contador).
 * ------------------------------------------------------------------------ */

const limites = config.seguridad.rateLimit;

/** Todo /api menos la ruta de salud (que se registra antes de este middleware). */
export const limiteGeneral = crearLimitador({ max: limites.maxGeneral });

/** Entradas con contraseña: 10 intentos fallidos por IP cada 15 minutos. */
export const limiteEntradas = crearLimitador({ max: limites.maxAuth, saltarExitosas: true });

/** Alta de cuentas ciudadanas. */
export const limiteRegistro = crearLimitador({ max: limites.maxRegistro });

/** Sesiones anónimas: evita inundar el almacén con sesiones desechables. */
export const limiteAnonimo = crearLimitador({ max: limites.maxAnonimo });

/** Escritura de contenido (reportes, comentarios, denuncias) por sesión. */
export const limiteEscritura = crearLimitador({ max: limites.maxEscritura, porCuenta: true });

/** Subida de evidencia por sesión. */
export const limiteSubidas = crearLimitador({ max: limites.maxUploads, porCuenta: true });
