/**
 * Exige la aceptación vigente de términos y aviso de privacidad antes de
 * cualquier acción de escritura.
 *
 * Las lecturas y las rutas necesarias para completar la aceptación quedan
 * abiertas. En `NODE_ENV=test` se desactiva por omisión para no penalizar toda
 * la suite; el test dedicado lo activa con `TERMINOS_EXIGIR_EN_PRUEBAS=true`.
 */
import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import { aceptacionVigente } from '../services/aceptaciones.service.js';

const PREFIJOS_LIBRES = ['/auth', '/legal', '/salud', '/publico/qr'];

function rutaLibre(ruta) {
  return PREFIJOS_LIBRES.some((prefijo) => ruta === prefijo || ruta.startsWith(`${prefijo}/`));
}

export async function exigirTerminos(req, res, next) {
  try {
    if (!config.terminos.exigir) return next();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (!req.usuario) return next();
    if (rutaLibre(req.path)) return next();
    if (config.env === 'test' && !config.terminos.exigirEnPruebas) return next();

    const estado = await aceptacionVigente(req.repositorio, req.usuario);
    if (estado.vigente) return next();

    return next(
      AppError.precondicionRequerida(
        'Debes leer y aceptar los términos y el aviso de privacidad vigentes para continuar.',
        {
          codigo: 'terminos_pendientes',
          versiones: estado.versiones,
          aceptadoEn: estado.ultima?.aceptadoEn || null
        }
      )
    );
  } catch (error) {
    return next(error);
  }
}
