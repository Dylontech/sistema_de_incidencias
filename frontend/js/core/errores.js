/** Manejo uniforme de errores de la API en la interfaz. */
import { toast } from './ui.js';
import { ErrorApi } from './api.js';

/** Convierte un error en un mensaje legible (incluye los detalles de validación). */
export function mensajeDeError(error) {
  if (!error) return 'Ocurrió un error inesperado';
  if (error instanceof ErrorApi && Array.isArray(error.detalles) && error.detalles.length) {
    const detalles = error.detalles.map((d) => `${d.campo}: ${d.mensaje}`).join(' · ');
    return `${error.message} (${detalles})`;
  }
  if (error.estado === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  if (error.estado === 403) return error.message || 'No tienes permiso para esta acción';
  return error.message || 'Ocurrió un error inesperado';
}

/**
 * Ejecuta una operación contra la API mostrando el error como aviso.
 * Devuelve el resultado o null si falló.
 */
export async function intentar(operacion, { exito = null } = {}) {
  try {
    const resultado = await operacion();
    if (exito) toast(exito, 'ok');
    return resultado;
  } catch (error) {
    toast(mensajeDeError(error), 'err');
    return null;
  }
}
