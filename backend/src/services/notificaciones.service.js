/** SERVICIO: Notificaciones por usuario. */
import { AppError } from '../utils/AppError.js';
import { dirigidaA } from '../models/notificacion.model.js';

/**
 * Buzón del usuario.
 *
 * La sesión anónima no tiene cuenta a la que avisar, así que su buzón está
 * siempre vacío: el sistema de cuentas decidió que el anónimo solo reporta y
 * que el seguimiento (avisos de estado, comentarios y resolución) es cosa de
 * quien se registra.
 */
export async function listar(repositorio, usuario) {
  if (usuario?.rol === 'anonimo') return [];
  return repositorio.notificacionesDe(usuario.userKey);
}

export async function marcarLeida(repositorio, usuario, id) {
  const todas = await repositorio.todasLasNotificaciones();
  const notificacion = todas.find((n) => n.id === id);
  if (!notificacion) throw AppError.noEncontrado('Notificación no encontrada');
  if (!dirigidaA(notificacion, usuario.userKey)) {
    throw AppError.prohibido('Esa notificación no es tuya');
  }

  await repositorio.marcarNotificacionLeida(id);
  return listar(repositorio, usuario);
}

export async function marcarTodasLeidas(repositorio, usuario) {
  const marcadas = await repositorio.marcarNotificacionesLeidas(usuario.userKey);
  return { marcadas, notificaciones: await listar(repositorio, usuario) };
}

export async function eliminar(repositorio, usuario, id) {
  const todas = await repositorio.todasLasNotificaciones();
  const notificacion = todas.find((n) => n.id === id);
  if (!notificacion) throw AppError.noEncontrado('Notificación no encontrada');
  if (!dirigidaA(notificacion, usuario.userKey)) {
    throw AppError.prohibido('Esa notificación no es tuya');
  }

  await repositorio.eliminarNotificacion(id);
  return listar(repositorio, usuario);
}
