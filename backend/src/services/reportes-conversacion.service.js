/**
 * SERVICIO: reportes de conversación.
 *
 * Cualquier participante puede reportar un hilo de mensajes internos o un
 * contacto directo. Se guarda una copia de los últimos mensajes de cada parte
 * (con sus adjuntos) para que la moderación decida aunque el contenido cambie.
 *
 * La resolución puede: descartar el reporte, restringir el envío de mensajes,
 * suspender la cuenta o darla de baja. Suspensión y baja se pueden revertir.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { alcanceDe, esAdminMaestro, esAlgunaAdmin } from './alcance.service.js';
import { tienePermiso } from './permisos.service.js';
import { emitir } from './notificaciones.service.js';
import * as mensajeria from './mensajeria.service.js';
import * as contactos from './contactos-funcionarios.service.js';
import { suspenderCuenta, reactivarCuenta } from './moderacion.service.js';
import { eliminar as eliminarUsuario, reactivar as reactivarUsuario } from './usuarios.service.js';
import {
  levantarRestriccionMensajes,
  restringirMensajes
} from './restricciones-mensajes.service.js';
import { MOTIVOS_DENUNCIA } from '../config/constantes.js';

const CANALES = ['mensaje', 'directo'];
const ACCIONES = ['descartar', 'suspender_mensajes', 'suspender_cuenta', 'baja_cuenta'];

const limpiar = (valor, max) => String(valor ?? '').trim().slice(0, max);

/** ¿La cuenta que resuelve puede tocar el municipio del reporte? */
function municipioPermitido(actor, municipioId) {
  if (esAdminMaestro(actor)) return true;
  const alcance = alcanceDe(actor);
  if (alcance.todos) return true;
  if (!municipioId) return Boolean(alcance.municipios || alcance.estados);
  if (alcance.municipios) return alcance.municipios.has(String(municipioId));
  if (alcance.estados) return true; // el catálogo de estados se valida al mostrar
  return false;
}

/** Últimos cinco mensajes de cada participante, en orden cronológico. */
function ultimosDeCadaParte(mensajes = []) {
  const ordenados = mensajes
    .slice()
    .sort((a, b) => new Date(a.creadoEn || a.fecha) - new Date(b.creadoEn || b.fecha));
  const porAutor = new Map();
  for (const mensaje of ordenados) {
    const clave = String(mensaje.deUsuario || mensaje.deUsuarioId || mensaje.deNombre || '?');
    if (!porAutor.has(clave)) porAutor.set(clave, []);
    const lista = porAutor.get(clave);
    lista.push(mensaje);
    if (lista.length > 5) lista.shift();
  }
  return [...porAutor.values()].flat().sort(
    (a, b) => new Date(a.creadoEn || a.fecha) - new Date(b.creadoEn || b.fecha)
  );
}

function sanearMensaje(mensaje) {
  return {
    de: limpiar(mensaje.deUsuario || mensaje.deNombre || 'Participante', 120),
    nombre: limpiar(mensaje.deNombre || mensaje.deUsuario || 'Participante', 160),
    cuerpo: String(mensaje.cuerpo || '').slice(0, 2000),
    fecha: mensaje.creadoEn || mensaje.fecha || null,
    adjuntos: (mensaje.adjuntos || []).slice(0, 3).map((adjunto) => ({
      id: adjunto.id,
      nombre: limpiar(adjunto.nombreOriginal || adjunto.nombre || 'Adjunto', 160),
      tipo: adjunto.tipo || ''
    }))
  };
}

/** Contexto para el modal: mensajes que se adjuntarán y el objetivo. */
export async function contexto(repositorio, actor, { canal, conversacionId } = {}) {
  if (!['mensaje', 'directo'].includes(canal)) {
    throw AppError.solicitudInvalida('Canal de conversación no válido');
  }
  const id = String(conversacionId || '');
  if (!id) throw AppError.solicitudInvalida('Conversación no válida');

  let mensajes = [];
  let asunto = 'Conversación';
  let municipioId = null;
  let objetivo = null;
  let asuntoContacto = null;

  if (canal === 'mensaje') {
    mensajes = await mensajeria.hilo(repositorio, actor, id);
    asunto = mensajes[0]?.asunto || 'Mensaje interno';
    const nombres = mensajes.flatMap((m) => [m.deUsuario, m.paraUsuario]).filter(Boolean);
    const otro = nombres.find((n) => n !== actor.username);
    objetivo = otro ? await repositorio.usuarioPorUsername(otro) : null;
    municipioId = objetivo?.municipioId || null;
  } else {
    const contacto = await contactos.detalle(repositorio, actor, id);
    asunto = contacto.asunto || 'Contacto directo';
    asuntoContacto = contacto.folio || null;
    municipioId = contacto.municipioId || null;
    if (String(contacto.deUsuarioId) === String(actor.id)) {
      const destinatarios =
        contacto.destinatarios || (await repositorio.contactoFuncionarioDestinatarios(contacto.id));
      objetivo = destinatarios[0]?.usuarioId
        ? await repositorio.usuarioPorId(destinatarios[0].usuarioId)
        : null;
    } else {
      objetivo = await repositorio.usuarioPorId(contacto.deUsuarioId);
    }
    mensajes = [
      {
        deUsuario: contacto.deUserKey || contacto.deNombre,
        deNombre: contacto.deNombre || 'Ciudadano',
        cuerpo: contacto.mensaje || '',
        creadoEn: contacto.creadoEn,
        adjuntos: contacto.adjuntos || []
      },
      ...(contacto.mensajes || [])
    ];
  }

  const recortados = ultimosDeCadaParte(mensajes).map(sanearMensaje);
  return {
    canal,
    conversacionId: id,
    asunto,
    folio: asuntoContacto,
    municipioId,
    objetivo: objetivo
      ? {
          id: objetivo.id,
          username: objetivo.username,
          nombre: objetivo.nombre || objetivo.username,
          rol: objetivo.rol
        }
      : null,
    mensajes: recortados
  };
}

export async function crear(repositorio, actor, datos = {}) {
  if (!actor || actor.rol === 'anonimo') {
    throw AppError.prohibido('Inicia sesión para reportar una conversación');
  }
  const canal = CANALES.includes(datos.canal) ? datos.canal : 'mensaje';
  const motivo = limpiar(datos.motivo, 60);
  if (!MOTIVOS_DENUNCIA.includes(motivo)) {
    throw AppError.solicitudInvalida('Elige un motivo válido para el reporte');
  }
  const detalle = limpiar(datos.detalle, 600);
  if (detalle.length < 10) {
    throw AppError.solicitudInvalida('Describe en al menos 10 caracteres qué ocurrió');
  }
  // Adjuntar los mensajes es opcional: sin ellos la moderación solo cuenta con
  // la descripción, y el reporte lo deja anotado para valorar la decisión.
  const incluirMensajes = datos.incluirMensajes !== false;

  const resumen = await contexto(repositorio, actor, {
    canal,
    conversacionId: datos.conversacionId
  });
  if (!resumen.objetivo) {
    throw AppError.solicitudInvalida('No se pudo identificar a la otra persona de la conversación');
  }
  if (String(resumen.objetivo.id) === String(actor.id)) {
    throw AppError.prohibido('No puedes reportar tu propia cuenta');
  }

  const pendientes = await repositorio.reportesConversacion({ estado: 'pendiente', limite: 300 });
  if (
    pendientes.some(
      (r) =>
        String(r.autorUsername) === String(actor.username) &&
        String(r.conversacionId) === String(resumen.conversacionId)
    )
  ) {
    throw AppError.conflicto('Ya tienes un reporte pendiente de esta conversación');
  }

  const reporte = {
    id: nuevoId(),
    fecha: new Date().toISOString(),
    municipioId: resumen.municipioId,
    canal,
    conversacionId: resumen.conversacionId,
    conversacionAsunto: limpiar(resumen.asunto, 160),
    objetivoUserKey: resumen.objetivo.username,
    objetivoUsername: resumen.objetivo.username,
    objetivoNombre: limpiar(resumen.objetivo.nombre, 160),
    autorUserKey: actor.userKey || actor.username,
    autorUsername: actor.username,
    autorNombre: limpiar(actor.nombre || actor.username, 160),
    motivo,
    detalle,
    mensajes: incluirMensajes ? resumen.mensajes : [],
    incluyeMensajes: incluirMensajes,
    estado: 'pendiente',
    accion: null,
    resolucion: '',
    resueltoPor: null,
    resueltoEn: null,
    revertidoPor: null,
    revertidoEn: null,
    sancion: null,
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearReporteConversacion(reporte);
  await emitir(repositorio, {
    evento: 'reporte_conversacion_creada',
    titulo: 'Reporte de una conversación',
    mensaje: `${reporte.autorNombre} reportó su conversación con ${reporte.objetivoNombre}: ${detalle}${
      incluirMensajes ? '' : ' (sin adjuntar los mensajes)'
    }`,
    municipioId: reporte.municipioId,
    entidadTipo: 'conversacion',
    entidadId: reporte.id,
    url: `/?admin=reportes-conversacion&reporte=${encodeURIComponent(reporte.id)}`,
    excluir: [actor.username]
  });
  return reporte;
}

export async function listar(repositorio, actor, filtros = {}) {
  if (!tienePermiso(actor, 'ver_moderacion')) {
    throw AppError.prohibido('No tienes permiso para ver los reportes de conversación');
  }
  const estado = ['pendiente', 'resuelto', 'descartado', 'revertido'].includes(filtros.estado)
    ? filtros.estado
    : null;
  const reportes = await repositorio.reportesConversacion({
    estado,
    limite: filtros.limite || 200
  });
  return reportes.filter((r) => municipioPermitido(actor, r.municipioId));
}

async function reporteConAlcance(repositorio, actor, id) {
  if (!tienePermiso(actor, 'moderar')) {
    throw AppError.prohibido('No tienes permiso para resolver reportes de conversación');
  }
  const reporte = await repositorio.reporteConversacionPorId(id);
  if (!reporte) throw AppError.noEncontrado('Reporte no encontrado');
  if (!municipioPermitido(actor, reporte.municipioId)) {
    throw AppError.prohibido('Ese reporte está fuera de tu ámbito territorial');
  }
  return reporte;
}

/** Bloquea el envío de mensajes si la cuenta tiene una restricción vigente. */
export { exigirSinRestriccionMensajes } from './restricciones-mensajes.service.js';

export async function resolver(repositorio, actor, id, datos = {}) {
  const reporte = await reporteConAlcance(repositorio, actor, id);
  if (reporte.estado !== 'pendiente') {
    throw AppError.conflicto('Ese reporte ya fue resuelto');
  }
  const accion = ACCIONES.includes(datos.accion) ? datos.accion : 'descartar';
  const resolucion = limpiar(datos.motivo, 600);
  const hasta = datos.hasta || null;
  const objetivo = await repositorio.usuarioPorUsername(reporte.objetivoUsername);
  if (!objetivo && accion !== 'descartar') {
    throw AppError.noEncontrado('La cuenta reportada ya no existe');
  }

  let sancion = null;
  if (accion === 'suspender_mensajes') {
    const restriccion = await restringirMensajes(repositorio, actor, objetivo, {
      motivo: resolucion || reporte.detalle,
      hasta
    });
    sancion = { tipo: accion, usuarioId: objetivo.id, restriccionId: restriccion.id, hasta };
  } else if (accion === 'suspender_cuenta') {
    await suspenderCuenta(repositorio, actor, objetivo.username, {
      motivo: resolucion || reporte.detalle,
      hasta
    });
    sancion = { tipo: accion, usuarioId: objetivo.id, username: objetivo.username };
  } else if (accion === 'baja_cuenta') {
    await eliminarUsuario(repositorio, actor, objetivo.id);
    sancion = { tipo: accion, usuarioId: objetivo.id, username: objetivo.username };
  }

  const actualizado = await repositorio.actualizarReporteConversacion(id, {
    estado: accion === 'descartar' ? 'descartado' : 'resuelto',
    accion,
    resolucion,
    resueltoPor: actor.username,
    resueltoEn: new Date().toISOString(),
    sancion
  });

  await emitir(repositorio, {
    evento: 'reporte_conversacion_resuelta',
    titulo: accion === 'descartar' ? 'Reporte descartado' : 'Reporte de conversación resuelto',
    mensaje:
      accion === 'descartar'
        ? `La moderación revisó tu reporte y no aplicó una sanción. ${resolucion}`.trim()
        : `La moderación revisó el reporte y aplicó una medida a ${reporte.objetivoNombre}. ${resolucion}`.trim(),
    paraUsuarios: [reporte.autorUsername],
    municipioId: reporte.municipioId,
    entidadTipo: 'conversacion',
    entidadId: id,
    url: '/?bandeja=mensajes'
  });

  if (sancion) {
    await emitir(repositorio, {
      evento: 'reporte_conversacion_resuelta',
      titulo: 'La moderación revisó una conversación',
      mensaje: `Se aplicó una medida a tu cuenta: ${resolucion || 'revisa el reporte en tu bandeja'}.`,
      paraUsuarios: [reporte.objetivoUsername],
      municipioId: reporte.municipioId,
      entidadTipo: 'conversacion',
      entidadId: id,
      url: '/'
    });
  }

  return actualizado;
}

export async function revertir(repositorio, actor, id) {
  const reporte = await reporteConAlcance(repositorio, actor, id);
  if (reporte.estado !== 'resuelto' || !reporte.sancion) {
    throw AppError.conflicto('Ese reporte no tiene una sanción que revertir');
  }
  const sancion = reporte.sancion;

  if (sancion.tipo === 'suspender_mensajes') {
    await levantarRestriccionMensajes(
      repositorio,
      sancion.usuarioId,
      sancion.restriccionId
    );
  } else if (sancion.tipo === 'suspender_cuenta') {
    await reactivarCuenta(repositorio, actor, sancion.username);
  } else if (sancion.tipo === 'baja_cuenta') {
    await reactivarUsuario(repositorio, actor, sancion.usuarioId);
  } else {
    throw AppError.solicitudInvalida('Esta medida no se puede revertir');
  }

  const actualizado = await repositorio.actualizarReporteConversacion(id, {
    estado: 'revertido',
    revertidoPor: actor.username,
    revertidoEn: new Date().toISOString()
  });

  await emitir(repositorio, {
    evento: 'reporte_conversacion_resuelta',
    titulo: 'Medida revertida',
    mensaje: 'La moderación revirtió la medida aplicada a tu cuenta.',
    paraUsuarios: [reporte.objetivoUsername],
    municipioId: reporte.municipioId,
    entidadTipo: 'conversacion',
    entidadId: id,
    url: '/'
  });
  return actualizado;
}
