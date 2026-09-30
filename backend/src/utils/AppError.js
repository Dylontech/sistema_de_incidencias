/**
 * Error de aplicación con código HTTP asociado.
 * Los middlewares de Express lo traducen a una respuesta JSON uniforme.
 */
export class AppError extends Error {
  constructor(estado, mensaje, detalles = null) {
    super(mensaje);
    this.name = 'AppError';
    this.estado = estado;
    this.detalles = detalles;
  }

  static solicitudInvalida(mensaje = 'Datos inválidos', detalles = null) {
    return new AppError(400, mensaje, detalles);
  }

  static noAutenticado(mensaje = 'Necesitas iniciar sesión') {
    return new AppError(401, mensaje);
  }

  static prohibido(mensaje = 'No tienes permiso para esta acción') {
    return new AppError(403, mensaje);
  }

  static noEncontrado(mensaje = 'Recurso no encontrado') {
    return new AppError(404, mensaje);
  }

  static conflicto(mensaje = 'Conflicto con el estado actual del recurso') {
    return new AppError(409, mensaje);
  }

  /**
   * 429: demasiados intentos seguidos (bloqueo temporal de la cuenta).
   * `detalles.reintentarEnSegundos` permite mostrar una cuenta atrás en lugar de
   * dejar al ciudadano probando a ciegas.
   */
  static demasiadasPeticiones(mensaje = 'Demasiados intentos. Espera un momento', detalles = null) {
    return new AppError(429, mensaje, detalles);
  }

  static errorInterno(mensaje = 'Error interno del servidor') {
    return new AppError(500, mensaje);
  }
}

/** Envuelve controladores async para que los errores lleguen al middleware. */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
