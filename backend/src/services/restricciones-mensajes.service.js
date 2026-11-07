/**
 * Restricción del envío de mensajes de una cuenta.
 *
 * Se aplica desde un reporte de conversación y se comprueba antes de crear un
 * mensaje interno o un contacto directo. La vigencia es opcional (`hasta`).
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';

const limpiar = (valor, max) => String(valor ?? '').trim().slice(0, max);

/** Lanza 403 si la cuenta tiene una restricción de mensajes vigente. */
export async function exigirSinRestriccionMensajes(repositorio, usuario) {
  if (!usuario?.id) return;
  const restriccion = await repositorio.restriccionMensajesVigente(usuario.id);
  if (!restriccion) return;
  const hasta = restriccion.hasta
    ? ` hasta el ${String(restriccion.hasta).slice(0, 10)}`
    : ' hasta que la moderación lo revise';
  throw AppError.prohibido(
    `Tus mensajes están restringidos${hasta}. Motivo: ${restriccion.motivo}`
  );
}

/** Crea la restricción y actualiza las columnas de la cuenta. */
export async function restringirMensajes(repositorio, actor, cuenta, { motivo, hasta = null } = {}) {
  const vigente = await repositorio.restriccionMensajesVigente(cuenta.id);
  if (vigente) throw AppError.conflicto('Esa cuenta ya tiene los mensajes restringidos');
  const restriccion = {
    id: nuevoId(),
    usuarioId: cuenta.id,
    userKey: cuenta.username,
    motivo: limpiar(motivo, 300) || 'Reporte de conversación',
    hasta: hasta || null,
    activo: true,
    creadoPor: actor?.username || null,
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearRestriccionMensajes(restriccion);
  await repositorio.actualizarUsuario(cuenta.id, {
    mensajesRestringidos: true,
    mensajesRestringidosHasta: restriccion.hasta,
    mensajesRestringidosMotivo: restriccion.motivo,
    mensajesRestringidosPor: actor?.nombre || actor?.username || null
  });
  return restriccion;
}

/** Desactiva la restricción y limpia las columnas de la cuenta. */
export async function levantarRestriccionMensajes(repositorio, usuarioId, restriccionId) {
  if (restriccionId) await repositorio.levantarRestriccionMensajes(restriccionId);
  await repositorio.actualizarUsuario(usuarioId, {
    mensajesRestringidos: false,
    mensajesRestringidosHasta: null,
    mensajesRestringidosMotivo: '',
    mensajesRestringidosPor: null
  });
}
