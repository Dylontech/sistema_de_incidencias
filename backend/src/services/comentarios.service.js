/**
 * SERVICIO: comentarios de incidencias con reglas anti-abuso.
 *
 * Se permite comentar a ciudadanos y sesiones anónimas. Las cuentas con
 * restricción activa no pueden comentar; la moderación puede restringir tanto
 * una cuenta como un `user_key` anónimo.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import {
  esEmpleado,
  esSoloLectura,
  exigirVisibilidad,
  puedeVerOculto
} from './alcance.service.js';
import { valor as valorConfig } from './configuracion.service.js';
import { emitir } from './notificaciones.service.js';
import { adjuntosDe, vincularAdjuntos } from './adjuntos.service.js';

function texto(valor, campo, { requerido = false, max = 500 } = {}) {
  const limpio = String(valor ?? '').trim();
  if (requerido && !limpio) {
    throw AppError.solicitudInvalida('Comentario inválido', [
      { campo, mensaje: 'Escribe un comentario' }
    ]);
  }
  if (limpio.length > max) {
    throw AppError.solicitudInvalida('Comentario inválido', [
      { campo, mensaje: `No puede exceder ${max} caracteres` }
    ]);
  }
  return limpio;
}

async function incidenciaVisible(repositorio, usuario, incidenciaId) {
  const incidencia = await repositorio.incidenciaPorId(incidenciaId);
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  exigirVisibilidad(incidencia, usuario);
  if (incidencia.oculta && !puedeVerOculto(incidencia, usuario)) {
    throw AppError.noEncontrado('Incidencia no encontrada');
  }
  return incidencia;
}

async function exigirSinRestriccion(repositorio, usuario) {
  const restriccion = await repositorio.restriccionComentariosVigente({
    usuarioId: usuario.id || null,
    userKey: usuario.userKey || null
  });
  if (restriccion) {
    const hasta = restriccion.hasta
      ? ` hasta ${new Date(restriccion.hasta).toLocaleString('es-MX')}`
      : '';
    throw AppError.prohibido(
      `Tus comentarios están restringidos${hasta}. Motivo: ${restriccion.motivo}`
    );
  }
}

/** Lista paginada; los ocultos solo se muestran a quien puede moderarlos. */
export async function listar(repositorio, usuario, incidenciaId, filtros = {}) {
  const incidencia = await incidenciaVisible(repositorio, usuario, incidenciaId);
  const incluirOcultos = esEmpleado(usuario) || puedeVerOculto(incidencia, usuario);
  const resultado = await repositorio.comentariosDeIncidencia(incidenciaId, {
    incluirOcultos,
    incluirEliminados: esEmpleado(usuario),
    pagina: Number(filtros.pagina) || 1,
    limite: Number(filtros.limite) || 50
  });
  const mapa = await adjuntosDe(
    repositorio,
    'comentario',
    (resultado.comentarios || []).map((comentario) => comentario.id)
  );
  resultado.comentarios = (resultado.comentarios || []).map((comentario) => ({
    ...comentario,
    adjuntos: mapa.get(comentario.id) || []
  }));
  return resultado;
}

/** Crea un comentario aplicando límites de texto, enlaces, espera y cuota diaria. */
export async function crear(repositorio, usuario, incidenciaId, datos = {}, { ipHash = null } = {}) {
  const incidencia = await incidenciaVisible(repositorio, usuario, incidenciaId);
  if (esSoloLectura(usuario)) {
    throw AppError.prohibido('Tu cuenta es de solo lectura');
  }
  await exigirSinRestriccion(repositorio, usuario);

  const max = 500;
  const adjuntos = Array.isArray(datos.adjuntos) ? [...new Set(datos.adjuntos.map(String))].slice(0, 3) : [];
  if (adjuntos.length && usuario.esAnonimo) {
    throw AppError.prohibido('Crea una cuenta para adjuntar imágenes a un comentario');
  }
  const contenido = texto(datos.texto, 'texto', { requerido: adjuntos.length === 0, max });
  const enlaces = (contenido.match(/https?:\/\//gi) || []).length;
  const maxEnlaces = await valorConfig(repositorio, 'comentarios.max_enlaces');
  if (enlaces > maxEnlaces) {
    throw AppError.solicitudInvalida('Comentario inválido', [
      { campo: 'texto', mensaje: `Máximo ${maxEnlaces} enlaces por comentario` }
    ]);
  }

  const espera = await valorConfig(repositorio, 'comentarios.espera_segundos');
  if (espera > 0) {
    const desde = new Date(Date.now() - espera * 1000).toISOString();
    const recientes = await repositorio.contarComentariosRecientes(usuario.userKey, desde);
    if (recientes > 0) {
      throw AppError.conflicto(`Espera ${espera} segundos antes de volver a comentar`);
    }
  }

  const maxDia = await valorConfig(repositorio, 'comentarios.max_por_dia');
  const desdeDia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const delDia = await repositorio.contarComentariosRecientes(usuario.userKey, desdeDia);
  if (delDia >= maxDia) {
    throw AppError.prohibido(`Alcanzaste el máximo de ${maxDia} comentarios por día`);
  }

  const comentario = {
    id: nuevoId(),
    fecha: new Date().toISOString(),
    autor: usuario.esAnonimo ? 'Anónimo' : usuario.nombre || usuario.username,
    texto: contenido,
    userKey: usuario.userKey || null,
    oculto: false,
    ocultoPor: null,
    ocultoFecha: null,
    ocultoMotivo: '',
    eliminadoEn: null,
    editadoEn: null
  };
  await repositorio.crearComentarioIncidencia(incidenciaId, comentario);
  if (adjuntos.length) {
    await vincularAdjuntos(repositorio, usuario, adjuntos, {
      contextoTipo: 'comentario',
      contextoId: comentario.id,
      proposito: 'comentario'
    });
    const mapa = await adjuntosDe(repositorio, 'comentario', [comentario.id]);
    comentario.adjuntos = mapa.get(comentario.id) || [];
  }

  if (incidencia.userKey && !incidencia.userKey.startsWith('anon_') && incidencia.userKey !== usuario.userKey) {
    await emitir(repositorio, {
      evento: 'incidencia_comentario',
      titulo: '💬 Nuevo comentario',
      mensaje: `${comentario.autor} comentó "${incidencia.titulo}".`,
      severidad: 'info',
      entidadTipo: 'incidencia',
      entidadId: incidenciaId,
      municipioId: incidencia.municipioId,
      url: `/?incidencia=${encodeURIComponent(incidenciaId)}&comentarios=1`,
      paraUsuarios: [incidencia.userKey],
      claveDedupe: `comentario:${comentario.id}`
    });
  }

  return comentario;
}

/** Borrado lógico por el autor o un administrador. */
export async function eliminar(repositorio, usuario, incidenciaId, comentarioId) {
  const incidencia = await incidenciaVisible(repositorio, usuario, incidenciaId);
  const comentarios = await repositorio.comentariosDeIncidencia(incidenciaId, {
    incluirOcultos: true,
    incluirEliminados: true,
    limite: 200
  });
  const comentario = comentarios.comentarios.find((c) => c.id === comentarioId);
  if (!comentario) throw AppError.noEncontrado('Comentario no encontrado');
  const esAutor = comentario.userKey && comentario.userKey === usuario.userKey;
  if (!esAutor && usuario.rol !== 'admin' && !esEmpleado(usuario)) {
    throw AppError.prohibido('No puedes borrar este comentario');
  }
  const actualizado = await repositorio.actualizarComentarioIncidencia(incidenciaId, comentarioId, {
    eliminadoEn: new Date().toISOString()
  });
  return actualizado;
}

/** Restringe los comentarios de una cuenta del personal o ciudadana. */
export async function restringirCuenta(repositorio, actor, username, datos = {}) {
  const cuenta = await repositorio.usuarioPorUsername(username);
  if (!cuenta) throw AppError.noEncontrado('Cuenta no encontrada');
  if (cuenta.rol === 'admin') throw AppError.prohibido('No se puede restringir a un administrador');
  const motivo = texto(datos.motivo, 'motivo', { requerido: true, max: 300 });
  const hasta = datos.hasta ? new Date(datos.hasta) : null;
  if (hasta && hasta.getTime() <= Date.now()) {
    throw AppError.solicitudInvalida('La fecha de fin debe ser futura');
  }
  const restriccion = {
    id: nuevoId(),
    usuarioId: cuenta.id,
    userKey: null,
    motivo,
    hasta: hasta ? hasta.toISOString() : null,
    activo: true,
    creadoPor: actor.username,
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearRestriccionComentarios(restriccion);
  await repositorio.actualizarUsuario(cuenta.id, {
    comentariosRestringidos: true,
    comentariosRestringidosHasta: restriccion.hasta,
    comentariosRestringidosMotivo: motivo,
    comentariosRestringidosPor: actor.username
  });
  return restriccion;
}

/** Restringe un `user_key` anónimo. */
export async function restringirUserKey(repositorio, actor, userKey, datos = {}) {
  const clave = texto(userKey, 'userKey', { requerido: true, max: 120 });
  const motivo = texto(datos.motivo, 'motivo', { requerido: true, max: 300 });
  const hasta = datos.hasta ? new Date(datos.hasta) : null;
  if (hasta && hasta.getTime() <= Date.now()) {
    throw AppError.solicitudInvalida('La fecha de fin debe ser futura');
  }
  return repositorio.crearRestriccionComentarios({
    id: nuevoId(),
    usuarioId: null,
    userKey: clave,
    motivo,
    hasta: hasta ? hasta.toISOString() : null,
    activo: true,
    creadoPor: actor.username,
    creadoEn: new Date().toISOString()
  });
}

export async function levantarRestriccionCuenta(repositorio, actor, username) {
  const cuenta = await repositorio.usuarioPorUsername(username);
  if (!cuenta) throw AppError.noEncontrado('Cuenta no encontrada');
  const vigente = await repositorio.restriccionComentariosVigente({ usuarioId: cuenta.id });
  if (vigente) await repositorio.desactivarRestriccionComentarios(vigente.id);
  await repositorio.actualizarUsuario(cuenta.id, {
    comentariosRestringidos: false,
    comentariosRestringidosHasta: null,
    comentariosRestringidosMotivo: null,
    comentariosRestringidosPor: actor.username
  });
  return { ok: true };
}

export async function levantarRestriccionUserKey(repositorio, actor, userKey) {
  const clave = texto(userKey, 'userKey', { requerido: true, max: 120 });
  const vigente = await repositorio.restriccionComentariosVigente({ userKey: clave });
  if (vigente) await repositorio.desactivarRestriccionComentarios(vigente.id);
  return { ok: true };
}
