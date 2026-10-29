/**
 * SERVICIO: solicitudes de permisos del personal.
 *
 * Un funcionario puede pedir permisos extra (por ejemplo, gestionar usuarios de
 * su municipio). La solicitud avisa a los administradores; al aprobarla, los
 * permisos se guardan como excepciones de la cuenta y se suman a los del rol.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { PERMISOS, ROLES_ADMIN } from '../config/constantes.js';
import { alcanceDe, esAlgunaAdmin, esAdminMaestro } from './alcance.service.js';
import { permisosDe } from './permisos.service.js';
import { emitir } from './notificaciones.service.js';

function normalizarLista(valor) {
  const lista = Array.isArray(valor) ? valor : [];
  return [...new Set(lista.map(String).filter((p) => PERMISOS.includes(p)))];
}

async function destino(usuario) {
  const alcance = alcanceDe(usuario);
  if (alcance.municipios && alcance.municipios.size) {
    return { municipioId: [...alcance.municipios][0], estados: [] };
  }
  if (alcance.estados && alcance.estados.size) {
    return { municipioId: null, estados: [...alcance.estados] };
  }
  return { municipioId: usuario.municipioId || null, estados: [] };
}

/** ¿El administrador puede resolver solicitudes de esta cuenta? */
async function puedeResolver(repositorio, actor, cuenta) {
  if (!esAlgunaAdmin(actor)) return false;
  if (esAdminMaestro(actor)) return true;
  const propio = alcanceDe(actor);
  const objetivo = await repositorio.alcanceDeUsuario(cuenta.id);
  const municipiosObjetivo = objetivo.municipios.length
    ? objetivo.municipios
    : cuenta.municipioId
      ? [cuenta.municipioId]
      : [];
  if (propio.municipios) {
    return (
      municipiosObjetivo.length > 0 &&
      municipiosObjetivo.every((m) => propio.municipios.has(String(m)))
    );
  }
  if (propio.estados) {
    if (!objetivo.estados.length) return false;
    return objetivo.estados.every((e) => propio.estados.has(String(e)));
  }
  return false;
}

export async function crear(repositorio, usuario, datos = {}) {
  if (!usuario || usuario.rol === 'anonimo' || usuario.rol === 'ciudadano') {
    throw AppError.prohibido('Solo el personal puede solicitar permisos');
  }
  const motivo = String(datos.motivo || '').trim();
  if (motivo.length < 10) {
    throw AppError.solicitudInvalida('Explica en al menos 10 caracteres para qué necesitas los permisos');
  }
  if (motivo.length > 600) throw AppError.solicitudInvalida('El motivo es demasiado largo');

  const actuales = new Set(permisosDe(usuario));
  const pedidos = normalizarLista(datos.permisos).filter((p) => !actuales.has(p));
  if (!pedidos.length) {
    throw AppError.solicitudInvalida('No pediste ningún permiso nuevo');
  }

  const abiertas = await repositorio.solicitudesPermiso({
    usuarioId: usuario.id,
    estado: 'pendiente',
    limite: 20
  });
  if (abiertas.length) {
    throw AppError.conflicto('Ya tienes una solicitud de permisos pendiente');
  }

  const lugar = await destino(usuario);
  const ahora = new Date().toISOString();
  const solicitud = {
    id: nuevoId(),
    usuarioId: usuario.id,
    username: usuario.username,
    nombre: usuario.nombre || usuario.username,
    municipioId: lugar.municipioId,
    permisos: pedidos,
    motivo,
    estado: 'pendiente',
    resueltoPor: null,
    resueltoEn: null,
    respuesta: '',
    creadoEn: ahora
  };
  await repositorio.crearSolicitudPermiso(solicitud);
  await emitir(repositorio, {
    evento: 'permiso_solicitado',
    titulo: 'Solicitud de permisos',
    mensaje: `${solicitud.nombre} solicita: ${pedidos.join(', ')}`,
    municipioId: solicitud.municipioId,
    entidadTipo: 'permiso',
    entidadId: solicitud.id,
    url: '/?panel=usuarios',
    excluir: [usuario.username]
  });
  return solicitud;
}

export async function misSolicitudes(repositorio, usuario) {
  return repositorio.solicitudesPermiso({ usuarioId: usuario.id, limite: 50 });
}

export async function listar(repositorio, actor, filtros = {}) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo administración puede revisar solicitudes de permisos');
  }
  const estado = ['pendiente', 'aprobada', 'rechazada'].includes(filtros.estado)
    ? filtros.estado
    : null;
  const solicitudes = await repositorio.solicitudesPermiso({ estado, limite: filtros.limite || 200 });
  if (esAdminMaestro(actor)) return solicitudes;

  const alcance = alcanceDe(actor);
  return solicitudes.filter((s) => {
    if (!s.municipioId) return false;
    if (alcance.municipios) return alcance.municipios.has(String(s.municipioId));
    return false;
  });
}

export async function resolver(repositorio, actor, id, { aprobar = true, respuesta = '' } = {}) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo administración puede resolver solicitudes de permisos');
  }
  const solicitud = await repositorio.solicitudPermisoPorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  if (solicitud.estado !== 'pendiente') {
    throw AppError.conflicto('Esa solicitud ya fue resuelta');
  }
  const cuenta = await repositorio.usuarioPorId(solicitud.usuarioId);
  if (!cuenta) throw AppError.noEncontrado('La cuenta solicitante ya no existe');
  if (!(await puedeResolver(repositorio, actor, cuenta))) {
    throw AppError.prohibido('Esa cuenta está fuera de tu ámbito');
  }

  const ahora = new Date().toISOString();
  if (aprobar) {
    const actuales = { ...(cuenta.permisos || {}) };
    for (const permiso of solicitud.permisos) actuales[permiso] = true;
    await repositorio.actualizarUsuario(cuenta.id, { permisos: actuales });
  }
  const actualizada = await repositorio.actualizarSolicitudPermiso(id, {
    estado: aprobar ? 'aprobada' : 'rechazada',
    resueltoPor: actor.username,
    resueltoEn: ahora,
    respuesta: String(respuesta || '').slice(0, 600)
  });

  await emitir(repositorio, {
    evento: 'permiso_resuelto',
    titulo: aprobar ? 'Permisos aprobados' : 'Solicitud de permisos rechazada',
    mensaje: aprobar
      ? `Se aprobaron tus permisos: ${solicitud.permisos.join(', ')}. Vuelve a iniciar sesión para verlos en tu cuenta.`
      : `Tu solicitud fue rechazada. ${respuesta || ''}`.trim(),
    paraUsuarios: [cuenta.username],
    municipioId: solicitud.municipioId,
    entidadTipo: 'permiso',
    entidadId: id,
    url: '/'
  });
  return actualizada;
}

/** ¿El actor puede revisar solicitudes de permisos? */
export function puedeRevisar(usuario) {
  return Boolean(usuario && ROLES_ADMIN.includes(usuario.rol));
}
