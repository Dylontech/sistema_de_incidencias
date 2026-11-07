/**
 * SERVICIO: reclamaciones sobre incidencias resueltas.
 *
 * Cualquier cuenta registrada puede reclamar si considera que el problema no
 * quedó solucionado. La revisa el funcionario del municipio y la
 * administración; el administrador puede delegar la decisión final en un
 * funcionario o resolverla directamente. Si se acepta, la incidencia se reabre
 * (`en_proceso`) y ambas partes reciben el aviso con el informe preliminar.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { ahoraIso } from '../utils/fechas.js';
import { alcanceDe, esAlgunaAdmin, esAdminMaestro, esEmpleado } from './alcance.service.js';
import { tienePermiso } from './permisos.service.js';
import { emitir } from './notificaciones.service.js';
import { agregarHistorial } from '../models/incidencia.model.js';

const MOTIVOS = ['no_resuelta', 'solucion_incompleta', 'danos_no_reparados', 'otro'];

const limpiar = (valor, max) => String(valor ?? '').trim().slice(0, max);

/** ¿La cuenta puede intervenir en el municipio de la incidencia? */
function municipioPermitido(actor, municipioId) {
  if (esAdminMaestro(actor) || !municipioId) return true;
  const alcance = alcanceDe(actor);
  if (alcance.todos) return true;
  if (alcance.municipios) return alcance.municipios.has(String(municipioId));
  if (alcance.estados) return true;
  return false;
}

function exigirGestion(actor) {
  if (!esEmpleado(actor) || !tienePermiso(actor, 'gestionar_reclamaciones')) {
    throw AppError.prohibido('No tienes permiso para gestionar reclamaciones');
  }
}

/** Crea una reclamación sobre una incidencia resuelta. */
export async function crear(repositorio, actor, incidenciaId, datos = {}) {
  if (!actor || actor.rol === 'anonimo' || !actor.id) {
    throw AppError.prohibido('Crea una cuenta para reclamar una incidencia');
  }
  const incidencia = await repositorio.incidenciaPorId(String(incidenciaId || ''));
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  if (incidencia.estado !== 'resuelta') {
    throw AppError.conflicto('Solo puedes reclamar una incidencia que ya fue resuelta');
  }
  const motivo = limpiar(datos.motivo, 60);
  if (!MOTIVOS.includes(motivo)) {
    throw AppError.solicitudInvalida('Elige un motivo válido para la reclamación');
  }
  const detalle = limpiar(datos.detalle, 600);
  if (detalle.length < 10) {
    throw AppError.solicitudInvalida('Explica en al menos 10 caracteres por qué no se resolvió');
  }

  const previas = await repositorio.reclamaciones({
    incidenciaId: incidencia.id,
    usuarioId: actor.id,
    estado: 'pendiente',
    limite: 10
  });
  if (previas.length) {
    throw AppError.conflicto('Ya tienes una reclamación pendiente de esta incidencia');
  }

  const reclamacion = {
    id: nuevoId(),
    incidenciaId: incidencia.id,
    municipioId: incidencia.municipioId || null,
    incidenciaTitulo: incidencia.titulo || '',
    usuarioId: actor.id,
    userKey: actor.userKey || actor.username || null,
    username: actor.username || null,
    nombre: actor.nombre || actor.username || 'Cuenta',
    motivo,
    detalle,
    estado: 'pendiente',
    decision: null,
    respuesta: '',
    resueltoPor: null,
    resueltoEn: null,
    delegadoA: null,
    delegadoEn: null,
    creadoEn: ahoraIso()
  };
  await repositorio.crearReclamacion(reclamacion);

  await emitir(repositorio, {
    evento: 'reclamacion_creada',
    titulo: '📣 Reclamación de una incidencia resuelta',
    mensaje: `${reclamacion.nombre} reclamó "${incidencia.titulo}": ${detalle}`,
    municipioId: reclamacion.municipioId,
    entidadTipo: 'reclamacion',
    entidadId: reclamacion.id,
    url: `/?admin=reclamaciones&reclamacion=${encodeURIComponent(reclamacion.id)}`,
    excluir: [actor.username]
  });

  return reclamacion;
}

/** Listado para el personal con permiso (filtrado por su ámbito). */
export async function listar(repositorio, actor, filtros = {}) {
  exigirGestion(actor);
  const estado = ['pendiente', 'en_revision', 'resuelta', 'rechazada'].includes(filtros.estado)
    ? filtros.estado
    : null;
  const lista = await repositorio.reclamaciones({
    estado,
    limite: filtros.limite || 200
  });
  return lista.filter((fila) => municipioPermitido(actor, fila.municipioId));
}

/** Detalle: lo ve el personal con permiso y quien reclamó. */
export async function obtener(repositorio, actor, id) {
  const reclamacion = await repositorio.reclamacionPorId(String(id || ''));
  if (!reclamacion) throw AppError.noEncontrado('Reclamación no encontrada');
  const propia = String(reclamacion.usuarioId) === String(actor?.id);
  if (!propia) {
    exigirGestion(actor);
    if (!municipioPermitido(actor, reclamacion.municipioId)) {
      throw AppError.prohibido('Esa reclamación está fuera de tu ámbito territorial');
    }
  }
  return reclamacion;
}

/** El administrador delega la decisión final en un funcionario del municipio. */
export async function delegar(repositorio, actor, id, datos = {}) {
  exigirGestion(actor);
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo la administración puede delegar la decisión');
  }
  const reclamacion = await repositorio.reclamacionPorId(String(id || ''));
  if (!reclamacion) throw AppError.noEncontrado('Reclamación no encontrada');
  if (!['pendiente', 'en_revision'].includes(reclamacion.estado)) {
    throw AppError.conflicto('Esa reclamación ya está resuelta');
  }
  if (!municipioPermitido(actor, reclamacion.municipioId)) {
    throw AppError.prohibido('Esa reclamación está fuera de tu ámbito territorial');
  }
  const username = limpiar(datos.delegadoA || datos.username, 120);
  const delegado = username ? await repositorio.usuarioPorUsername(username) : null;
  if (!delegado || !esEmpleado(delegado)) {
    throw AppError.solicitudInvalida('Elige una cuenta del personal para delegar');
  }
  if (reclamacion.municipioId) {
    const permitido = municipioPermitido(delegado, reclamacion.municipioId);
    if (!permitido) {
      throw AppError.solicitudInvalida('Esa cuenta no pertenece al municipio de la incidencia');
    }
  }

  const actualizada = await repositorio.actualizarReclamacion(reclamacion.id, {
    estado: 'en_revision',
    delegadoA: delegado.username,
    delegadoEn: ahoraIso()
  });

  await emitir(repositorio, {
    evento: 'reclamacion_delegada',
    titulo: '🤝 Te delegaron una reclamación',
    mensaje: `La administración te pidió decidir la reclamación de "${reclamacion.incidenciaTitulo}".`,
    municipioId: reclamacion.municipioId,
    entidadTipo: 'reclamacion',
    entidadId: reclamacion.id,
    url: `/?admin=reclamaciones&reclamacion=${encodeURIComponent(reclamacion.id)}`,
    paraUsuarios: [delegado.username]
  });

  return actualizada;
}

/** Resolución: mantener la incidencia resuelta o reabrirla. */
export async function resolver(repositorio, actor, id, datos = {}) {
  exigirGestion(actor);
  const reclamacion = await repositorio.reclamacionPorId(String(id || ''));
  if (!reclamacion) throw AppError.noEncontrado('Reclamación no encontrada');
  if (!municipioPermitido(actor, reclamacion.municipioId)) {
    throw AppError.prohibido('Esa reclamación está fuera de tu ámbito territorial');
  }
  if (reclamacion.estado === 'resuelta' || reclamacion.estado === 'rechazada') {
    throw AppError.conflicto('Esa reclamación ya fue resuelta');
  }
  if (
    reclamacion.delegadoA &&
    reclamacion.delegadoA !== actor.username &&
    !esAlgunaAdmin(actor)
  ) {
    throw AppError.prohibido('La decisión fue delegada a otra cuenta');
  }
  const decision = datos.decision === 'revertir' ? 'revertir' : 'mantener';
  const respuesta = limpiar(datos.respuesta, 600);
  if (respuesta.length < 5) {
    throw AppError.solicitudInvalida('Escribe una respuesta para las partes');
  }

  const ahora = ahoraIso();
  let incidencia = await repositorio.incidenciaPorId(reclamacion.incidenciaId);
  if (decision === 'revertir' && incidencia) {
    const reabierta = {
      ...incidencia,
      estado: 'en_proceso',
      actualizado: ahora,
      archivadaEn: null,
      historial: agregarHistorial(incidencia, {
        estado: 'en_proceso',
        accion: `Reclamación aceptada: se reabre la incidencia. ${respuesta}`,
        por: actor.nombre,
        ahora
      })
    };
    await repositorio.actualizarIncidencia(incidencia.id, reabierta);
    incidencia = reabierta;
  }

  const actualizada = await repositorio.actualizarReclamacion(reclamacion.id, {
    estado: decision === 'revertir' ? 'resuelta' : 'rechazada',
    decision,
    respuesta,
    resueltoPor: actor.username || actor.nombre,
    resueltoEn: ahora
  });

  const mensaje =
    decision === 'revertir'
      ? `La reclamación fue aceptada y la incidencia se reabrió: ${respuesta}`
      : `La reclamación fue revisada y la incidencia se mantiene resuelta: ${respuesta}`;
  // A la persona que reclamó se le avisa siempre; al personal del municipio se
  // le manda un aviso aparte porque `paraUsuarios` limita los destinatarios.
  await emitir(repositorio, {
    evento: 'reclamacion_resuelta',
    titulo: decision === 'revertir' ? '✅ Reclamación aceptada' : '📄 Reclamación revisada',
    mensaje,
    municipioId: reclamacion.municipioId,
    entidadTipo: 'reclamacion',
    entidadId: reclamacion.id,
    url: `/?reclamacion=${encodeURIComponent(reclamacion.id)}`,
    paraUsuarios: [reclamacion.username].filter(Boolean)
  });
  await emitir(repositorio, {
    evento: 'reclamacion_resuelta',
    titulo: 'Decisión de una reclamación',
    mensaje: `${reclamacion.incidenciaTitulo}: ${mensaje}`,
    municipioId: reclamacion.municipioId,
    entidadTipo: 'reclamacion',
    entidadId: reclamacion.id,
    url: `/?admin=reclamaciones&reclamacion=${encodeURIComponent(reclamacion.id)}`,
    excluir: [actor.username, reclamacion.username].filter(Boolean)
  });

  return { reclamacion: actualizada, incidencia: incidencia ? { id: incidencia.id, estado: incidencia.estado } : null };
}
