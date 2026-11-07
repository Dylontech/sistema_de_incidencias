/**
 * SERVICIO: bloqueos entre cuentas.
 *
 * Bloquear es una decisión personal y reversible: impide que la otra persona
 * siga enviando mensajes (internos o de contacto directo) sin avisarle y sin
 * generar una sanción. Se aplica en los dos sentidos para que el bloqueo no se
 * pueda esquivar respondiendo desde el otro lado.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';

const TEXTO_MOTIVO = 300;

function exigirCuenta(actor) {
  if (!actor || actor.rol === 'anonimo' || !actor.id) {
    throw AppError.prohibido('Inicia sesión para bloquear cuentas');
  }
}

/** Bloqueos que ha creado la cuenta (los que puede deshacer). */
export async function listar(repositorio, actor) {
  exigirCuenta(actor);
  return repositorio.bloqueosDeUsuario(actor.id);
}

/** Bloquea a otra cuenta por `username` o `usuarioId`. */
export async function bloquear(repositorio, actor, datos = {}) {
  exigirCuenta(actor);
  const objetivo = datos.usuarioId
    ? await repositorio.usuarioPorId(String(datos.usuarioId))
    : await repositorio.usuarioPorUsername(String(datos.username || '').trim());
  if (!objetivo) throw AppError.noEncontrado('La cuenta no existe');
  if (String(objetivo.id) === String(actor.id)) {
    throw AppError.solicitudInvalida('No puedes bloquearte a ti mismo');
  }
  const existente = await repositorio.bloqueoEntre(actor.id, objetivo.id);
  if (existente) return existente;

  const bloqueo = {
    id: nuevoId(),
    usuarioId: actor.id,
    usuarioUsername: actor.username || null,
    bloqueadoId: objetivo.id,
    bloqueadoUsername: objetivo.username || null,
    bloqueadoNombre: objetivo.nombre || objetivo.username || '',
    motivo: String(datos.motivo ?? '').trim().slice(0, TEXTO_MOTIVO),
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearBloqueoUsuario(bloqueo);
  return bloqueo;
}

/** Deshace un bloqueo propio. Acepta el id interno o el nombre de usuario. */
export async function desbloquear(repositorio, actor, bloqueadoId) {
  exigirCuenta(actor);
  const id = String(bloqueadoId || '');
  if (!id) throw AppError.solicitudInvalida('Indica qué cuenta desbloquear');
  const lista = await repositorio.bloqueosDeUsuario(actor.id);
  const bloqueo = lista.find(
    (fila) => String(fila.bloqueadoId) === id || fila.bloqueadoUsername === id
  );
  if (!bloqueo) throw AppError.noEncontrado('Esa cuenta no está bloqueada');
  await repositorio.eliminarBloqueoUsuario(actor.id, bloqueo.bloqueadoId);
  return { desbloqueado: true };
}

/** ¿Alguna de las dos cuentas bloqueó a la otra? */
export async function bloqueoMutuo(repositorio, uno, otro) {
  if (!uno?.id || !otro?.id) return null;
  const mio = await repositorio.bloqueoEntre(uno.id, otro.id);
  if (mio) return { ...mio, direccion: 'propio' };
  const suyo = await repositorio.bloqueoEntre(otro.id, uno.id);
  if (suyo) return { ...suyo, direccion: 'ajeno' };
  return null;
}

/**
 * Corta el envío cuando hay un bloqueo. `de` es quien escribe y `para` quien
 * recibiría el mensaje.
 */
export async function exigirNoBloqueado(repositorio, de, para) {
  const bloqueo = await bloqueoMutuo(repositorio, de, para);
  if (!bloqueo) return;
  if (bloqueo.direccion === 'propio') {
    throw AppError.prohibido(
      'Has bloqueado a esta persona. Desbloquéala para volver a enviarle mensajes.'
    );
  }
  throw AppError.prohibido('Esta persona no acepta mensajes tuyos.');
}
