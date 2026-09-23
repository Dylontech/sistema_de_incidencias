/** Manejo uniforme de errores: toda la API responde { error, detalles }. */
import { AppError } from '../utils/AppError.js';
import { esProduccion } from '../config/index.js';

export function rutaNoEncontrada(req, res, next) {
  next(AppError.noEncontrado(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

export function manejarErrores(err, req, res, next) { // eslint-disable-line no-unused-vars
  const esMulter = err?.name === 'MulterError';
  let estado = Number(err?.estado) || (esMulter ? 400 : 500);
  let mensaje = err?.message || 'Error interno del servidor';

  if (esMulter) {
    if (err.code === 'LIMIT_FILE_SIZE') mensaje = 'El archivo excede el tamaño máximo permitido';
    else if (err.code === 'LIMIT_FILE_COUNT') mensaje = 'Demasiados archivos en una sola carga';
    else if (err.code === 'LIMIT_UNEXPECTED_FILE') mensaje = 'Campo de archivo inesperado';
  }

  if (estado >= 500 && !esProduccion()) {
    console.error('[error]', err);
  }

  res.status(estado).json({
    error: mensaje,
    detalles: err?.detalles || null
  });
}
