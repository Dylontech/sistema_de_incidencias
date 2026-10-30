/**
 * SERVICIO: solicitudes de permisos del personal.
 *
 * Un funcionario puede pedir permisos extra (por ejemplo, gestionar usuarios de
 * su municipio). La solicitud avisa a los administradores; al aprobarla, los
 * permisos se guardan como excepciones de la cuenta y se suman a los del rol.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { PERMISOS } from '../config/constantes.js';
import { alcanceDe, esAdminMaestro } from './alcance.service.js';
import { permisosDe, permisosFueraDeAlcance, tienePermiso } from './permisos.service.js';
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

/** ¿El actor puede resolver solicitudes de esta cuenta? */
async function puedeResolver(repositorio, actor, cuenta) {
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
      municipiosObjetivo.every((m) => propio.municipios.has(String(m)))
    );
  }
  if (propio.estados) {
    // El alcance estatal de la cuenta también puede venir de sus municipios.
    if (objetivo.estados.length && objetivo.estados.every((e) => propio.estados.has(String(e)))) {
      return true;
    }
    if (!municipiosObjetivo.length) return false;
    const catalogo = await repositorio.municipiosLigeros();
    const porId = new Map(catalogo.map((m) => [String(m.id), m.estado]));
    return municipiosObjetivo.every((id) => propio.estados.has(porId.get(String(id))));
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
    estados: lugar.estados,
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
  if (!tienePermiso(actor, 'ver_solicitudes_permisos')) {
    throw AppError.prohibido('No tienes permiso para revisar solicitudes de permisos');
  }
  const estado = ['pendiente', 'aprobada', 'rechazada'].includes(filtros.estado)
    ? filtros.estado
    : null;
  const solicitudes = await repositorio.solicitudesPermiso({ estado, limite: filtros.limite || 200 });
  if (esAdminMaestro(actor)) return solicitudes;

  const alcance = alcanceDe(actor);
  if (alcance.todos) return solicitudes;
  const catalogo = await repositorio.municipiosLigeros();
  const estadoDeMunicipio = new Map(catalogo.map((m) => [String(m.id), m.estado]));
  return solicitudes.filter((s) => {
    if (alcance.municipios) {
      return Boolean(s.municipioId) && alcance.municipios.has(String(s.municipioId));
    }
    if (alcance.estados) {
      // 1) La solicitud puede declarar estados. 2) Si solo trae municipio, se
      // resuelve su entidad para no ocultarla a un administrador estatal.
      if (Array.isArray(s.estados) && s.estados.length) {
        return s.estados.some((estado) => alcance.estados.has(String(estado)));
      }
      const entidad = s.municipioId ? estadoDeMunicipio.get(String(s.municipioId)) : null;
      return Boolean(entidad) && alcance.estados.has(entidad);
    }
    return false;
  });
}

export async function resolver(repositorio, actor, id, { aprobar = true, respuesta = '' } = {}) {
  const permiso = aprobar ? 'aprobar_solicitudes_permisos' : 'rechazar_solicitudes_permisos';
  if (!tienePermiso(actor, permiso)) {
    throw AppError.prohibido('No tienes permiso para resolver solicitudes de permisos');
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
  if (aprobar) {
    // Nadie aprueba lo que no tiene: evita usar una solicitud para escalar.
    const fuera = permisosFueraDeAlcance(actor, solicitud.permisos);
    if (fuera.length) {
      throw AppError.prohibido(
        `No puedes aprobar permisos que tú no tienes: ${fuera.join(', ')}`
      );
    }
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
  return tienePermiso(usuario, 'ver_solicitudes_permisos');
}
