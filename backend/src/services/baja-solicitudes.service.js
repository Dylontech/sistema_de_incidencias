/**
 * SERVICIO: solicitudes de baja de cuentas del personal.
 *
 * Un funcionario puede pedir la baja de otro funcionario de su ámbito, pero no
 * desactivar la cuenta: la baja la aplica la administración. Así queda un
 * rastro de quién la pidió y por qué.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { ROLES_ADMIN, ROLES_PERSONAL } from '../config/constantes.js';
import { alcanceDe, esAdminMaestro, esAlgunaAdmin } from './alcance.service.js';
import { tienePermiso } from './permisos.service.js';
import { eliminar as eliminarUsuario } from './usuarios.service.js';
import { emitir } from './notificaciones.service.js';

/** ¿La cuenta objetivo cae dentro del territorio del actor? */
async function dentroDelAlcance(repositorio, actor, cuenta) {
  if (esAdminMaestro(actor)) return true;
  const propio = alcanceDe(actor);
  if (propio.todos) return true;
  const objetivo = await repositorio.alcanceDeUsuario(cuenta.id);
  const municipiosObjetivo = objetivo.municipios.length
    ? objetivo.municipios
    : cuenta.municipioId
      ? [cuenta.municipioId]
      : [];
  if (propio.municipios) {
    return (
      municipiosObjetivo.length > 0 &&
      municipiosObjetivo.every((id) => propio.municipios.has(String(id)))
    );
  }
  if (propio.estados) {
    if (
      objetivo.estados.length &&
      objetivo.estados.every((estado) => propio.estados.has(String(estado)))
    ) {
      return true;
    }
    if (!municipiosObjetivo.length) return false;
    const catalogo = await repositorio.municipiosLigeros();
    const porId = new Map(catalogo.map((m) => [String(m.id), m.estado]));
    return municipiosObjetivo.every((id) => propio.estados.has(porId.get(String(id))));
  }
  return false;
}

export async function crear(repositorio, actor, datos = {}) {
  if (!actor || !ROLES_PERSONAL.includes(actor.rol)) {
    throw AppError.prohibido('Solo el personal puede solicitar la baja de una cuenta');
  }
  if (!tienePermiso(actor, 'editar_usuarios') && !tienePermiso(actor, 'eliminar_usuarios')) {
    throw AppError.prohibido('No tienes permiso para solicitar la baja de cuentas');
  }
  const cuenta = await repositorio.usuarioPorId(String(datos.usuarioId || ''));
  if (!cuenta) throw AppError.noEncontrado('Usuario no encontrado');
  if (!ROLES_PERSONAL.includes(cuenta.rol)) {
    throw AppError.prohibido('Solo se pueden solicitar bajas de cuentas del personal');
  }
  if (ROLES_ADMIN.includes(cuenta.rol)) {
    throw AppError.prohibido('No puedes solicitar la baja de una cuenta de administración');
  }
  if (cuenta.id === actor.id) {
    throw AppError.conflicto('No puedes solicitar tu propia baja');
  }
  if (!(await dentroDelAlcance(repositorio, actor, cuenta))) {
    throw AppError.prohibido('Esa cuenta está fuera de tu ámbito territorial');
  }
  const motivo = String(datos.motivo || '').trim();
  if (motivo.length < 10) {
    throw AppError.solicitudInvalida('Explica en al menos 10 caracteres por qué se da de baja');
  }
  const pendientes = await repositorio.solicitudesBaja({
    usuarioId: cuenta.id,
    estado: 'pendiente',
    limite: 5
  });
  if (pendientes.length) {
    throw AppError.conflicto('Ya hay una solicitud de baja pendiente para esa cuenta');
  }

  const solicitud = {
    id: nuevoId(),
    usuarioId: cuenta.id,
    username: cuenta.username,
    nombre: cuenta.nombre || cuenta.username,
    solicitadoPorId: actor.id || null,
    solicitadoPor: actor.username || null,
    motivo: motivo.slice(0, 600),
    estado: 'pendiente',
    resueltoPor: null,
    resueltoEn: null,
    respuesta: '',
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearSolicitudBaja(solicitud);
  await emitir(repositorio, {
    evento: 'baja_solicitada',
    titulo: 'Solicitud de baja de una cuenta',
    mensaje: `${solicitud.solicitadoPor} pide dar de baja a ${solicitud.nombre}: ${solicitud.motivo}`,
    municipioId: cuenta.municipioId || null,
    entidadTipo: 'baja',
    entidadId: solicitud.id,
    url: `/?panel=usuarios&baja=${encodeURIComponent(solicitud.id)}&usuario=${encodeURIComponent(cuenta.id)}`,
    excluir: [solicitud.solicitadoPor]
  });
  return solicitud;
}

/** Solicitudes hechas por el propio actor. */
export async function mias(repositorio, actor) {
  const todas = await repositorio.solicitudesBaja({ limite: 200 });
  return todas.filter((s) => s.solicitadoPorId === actor.id);
}

export async function listar(repositorio, actor, filtros = {}) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo la administración revisa las solicitudes de baja');
  }
  const estado = ['pendiente', 'aprobada', 'rechazada'].includes(filtros.estado)
    ? filtros.estado
    : null;
  const solicitudes = await repositorio.solicitudesBaja({
    estado,
    limite: filtros.limite || 200
  });
  if (esAdminMaestro(actor)) return solicitudes;

  const visibles = [];
  for (const solicitud of solicitudes) {
    const cuenta = await repositorio.usuarioPorId(solicitud.usuarioId);
    if (cuenta && (await dentroDelAlcance(repositorio, actor, cuenta))) {
      visibles.push(solicitud);
    }
  }
  return visibles;
}

export async function resolver(repositorio, actor, id, { aprobar = true, respuesta = '' } = {}) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo la administración puede resolver solicitudes de baja');
  }
  const solicitud = await repositorio.solicitudBajaPorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  if (solicitud.estado !== 'pendiente') {
    throw AppError.conflicto('Esa solicitud ya fue resuelta');
  }
  const cuenta = await repositorio.usuarioPorId(solicitud.usuarioId);
  if (!cuenta) throw AppError.noEncontrado('La cuenta ya no existe');
  if (!(await dentroDelAlcance(repositorio, actor, cuenta))) {
    throw AppError.prohibido('Esa cuenta está fuera de tu ámbito territorial');
  }

  const actualizada = await repositorio.actualizarSolicitudBaja(id, {
    estado: aprobar ? 'aprobada' : 'rechazada',
    resueltoPor: actor.username,
    resueltoEn: new Date().toISOString(),
    respuesta: String(respuesta || '').slice(0, 600)
  });

  if (aprobar) {
    // Reutiliza la baja lógica (conserva historial y auditoría).
    await eliminarUsuario(repositorio, actor, cuenta.id);
  }

  await emitir(repositorio, {
    evento: 'baja_resuelta',
    titulo: aprobar ? 'Baja aplicada' : 'Solicitud de baja rechazada',
    mensaje: aprobar
      ? `La baja de ${cuenta.nombre || cuenta.username} se cumplió: la cuenta quedó desactivada y el movimiento quedó registrado en auditoría.`
      : `La solicitud de baja de ${cuenta.nombre || cuenta.username} fue rechazada. ${respuesta || ''}`.trim(),
    paraUsuarios: [solicitud.solicitadoPor].filter(Boolean),
    municipioId: cuenta.municipioId || null,
    entidadTipo: 'baja',
    entidadId: id,
    url: `/?panel=usuarios&baja=${encodeURIComponent(id)}&usuario=${encodeURIComponent(cuenta.id)}`
  });

  return actualizada;
}
