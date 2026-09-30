/** Manejo uniforme de errores: toda la API responde { error, detalles }. */
import { AppError } from '../utils/AppError.js';

export function rutaNoEncontrada(req, res, next) {
  next(AppError.noEncontrado(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

export function manejarErrores(err, req, res, next) { // eslint-disable-line no-unused-vars
  const esMulter = err?.name === 'MulterError';
  const esCuerpo = typeof err?.type === 'string' && err.type.startsWith('entity.');
  // `err.estado` es el campo de AppError; los errores de body-parser traen
  // `status`/`statusCode` (413 si el cuerpo pasa del límite configurado).
  let estado =
    Number(err?.estado) ||
    Number(err?.status) ||
    Number(err?.statusCode) ||
    (esMulter || esCuerpo ? 400 : 500);
  let mensaje = err?.message || 'Error interno del servidor';

  if (esMulter) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      // 413 (y no 400): el archivo es correcto, lo que pasa es que no cabe.
      estado = 413;
      mensaje = 'El archivo excede el tamaño máximo permitido';
    } else if (err.code === 'LIMIT_FILE_COUNT') mensaje = 'Demasiados archivos en una sola carga';
    else if (err.code === 'LIMIT_UNEXPECTED_FILE') mensaje = 'Campo de archivo inesperado';
  } else if (esCuerpo) {
    if (err.type === 'entity.too.large') {
      estado = 413;
      mensaje = 'El contenido enviado es demasiado grande';
    } else {
      estado = 400;
      mensaje = 'El cuerpo de la petición no se pudo interpretar';
    }
  }

  if (estado >= 500) {
    // Siempre, también en producción: dentro del contenedor los registros son
    // privados y sin la traza no hay forma de diagnosticar un 500.
    console.error('[error]', err);
  }

  res.status(estado).json({
    error: mensaje,
    detalles: err?.detalles || null
  });
}
