/**
 * SERVICIO: campañas de promoción por correo.
 *
 * Reglas de cumplimiento (LFPDPPP y buenas prácticas anti-spam):
 * - Solo se escribe a correos con **doble opt-in confirmado** (`estado=activa`).
 * - Cada envío lleva enlace de baja en un clic y aviso de privacidad.
 * - Se respeta la lista de bloqueos (`bloqueos_publicos`) como lista de supresión.
 * - El envío va por lotes con el límite `CORREO_MAX_POR_MINUTO` del servicio de correo.
 * - Nunca se aceptan listas compradas: las altas entran por el formulario público.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { normalizarCorreo } from '../models/usuario.model.js';
import { esAdmin } from './alcance.service.js';
import {
  enviarBajaConfirmada,
  enviarCampana as enviarCampanaCorreo,
  enviarConfirmacionSuscripcion
} from './correo.service.js';

/** Campañas que se están procesando ahora mismo (evita envíos duplicados). */
const enCurso = new Map();

function texto(valor, campo, { requerido = false, max = 300 } = {}) {
  const limpio = String(valor ?? '').trim();
  if (requerido && !limpio) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo, mensaje: 'Este campo es obligatorio' }
    ]);
  }
  if (limpio.length > max) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo, mensaje: `No puede exceder ${max} caracteres` }
    ]);
  }
  return limpio;
}

function exigirAdmin(usuario) {
  if (!esAdmin(usuario)) {
    throw AppError.prohibido('Solo un administrador puede gestionar las campañas');
  }
}

function tokenNuevo() {
  return nuevoId() + nuevoId().slice(0, 8);
}

/* ------------------------------ suscripciones ----------------------------- */

/**
 * Alta pública con doble opt-in. No revela si el correo ya existía: siempre
 * responde lo mismo para no filtrar datos de terceros.
 */
export async function suscribir(repositorio, datos = {}, { ipHash = null } = {}) {
  const correo = normalizarCorreo(datos.correo);
  if (!correo) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo: 'correo', mensaje: 'Escribe un correo válido' }
    ]);
  }
  const nombre = texto(datos.nombre, 'nombre', { max: 120 }) || null;
  const municipioId = texto(datos.municipioId, 'municipioId', { max: 64 }) || null;
  if (datos.aceptaAviso !== true) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo: 'aceptaAviso', mensaje: 'Debes aceptar el aviso de privacidad' }
    ]);
  }

  if (municipioId && !(await repositorio.municipioPorId(municipioId))) {
    throw AppError.solicitudInvalida('Municipio no encontrado');
  }

  const bloqueo = await repositorio.bloqueoVigente({ correo, ipHash });
  if (bloqueo) {
    throw AppError.prohibido(
      'Este correo no puede suscribirse. Escribe al administrador para revisar el bloqueo.'
    );
  }

  const existente = await repositorio.suscripcionPorCorreo(correo);
  if (existente?.estado === 'activa') {
    return {
      estado: 'activa',
      mensaje: 'Ese correo ya estaba suscrito. Recibirás las novedades del servicio.'
    };
  }

  let suscripcion;
  if (existente) {
    // Pendiente: se reenvía la confirmación. De baja: se reactiva con token nuevo.
    suscripcion = await repositorio.actualizarSuscripcion(existente.id, {
      nombre: nombre || existente.nombre,
      municipioId: municipioId || existente.municipioId,
      estado: 'pendiente',
      token: tokenNuevo(),
      confirmadoEn: null,
      bajaEn: null
    });
  } else {
    const ahora = new Date().toISOString();
    suscripcion = await repositorio.crearSuscripcion({
      id: nuevoId(),
      correo,
      nombre,
      municipioId,
      estado: 'pendiente',
      token: tokenNuevo(),
      origen: texto(datos.origen, 'origen', { max: 40 }) || 'web',
      confirmadoEn: null,
      bajaEn: null,
      ipHash,
      creadoEn: ahora,
      actualizadoEn: ahora
    });
  }

  await enviarConfirmacionSuscripcion(repositorio, suscripcion);
  return {
    estado: 'pendiente',
    mensaje: 'Te enviamos un correo para confirmar la suscripción. Revisa tu bandeja.'
  };
}

/** Confirma la suscripción desde el enlace del correo. */
export async function confirmar(repositorio, token) {
  const suscripcion = await repositorio.suscripcionPorToken(token);
  if (!suscripcion) throw AppError.noEncontrado('El enlace no es válido o ya caducó');
  if (suscripcion.estado === 'activa') {
    return { estado: 'activa', correo: suscripcion.correo, mensaje: 'Tu suscripción ya estaba confirmada.' };
  }
  const actualizada = await repositorio.actualizarSuscripcion(suscripcion.id, {
    estado: 'activa',
    confirmadoEn: new Date().toISOString(),
    bajaEn: null
  });
  return {
    estado: actualizada.estado,
    correo: actualizada.correo,
    mensaje: 'Suscripción confirmada. Recibirás información del servicio y podrás darte de baja cuando quieras.'
  };
}

/** Baja en un clic; el token se conserva para poder reactivar más adelante. */
export async function darDeBaja(repositorio, token) {
  const suscripcion = await repositorio.suscripcionPorToken(token);
  if (!suscripcion) throw AppError.noEncontrado('El enlace de baja no es válido');
  if (suscripcion.estado === 'baja') {
    return { estado: 'baja', mensaje: 'Ese correo ya estaba dado de baja.' };
  }
  await repositorio.actualizarSuscripcion(suscripcion.id, {
    estado: 'baja',
    bajaEn: new Date().toISOString()
  });
  await enviarBajaConfirmada(repositorio, suscripcion);
  return { estado: 'baja', mensaje: 'Listo, no volverás a recibir campañas informativas.' };
}

/** Listado para el panel de administración. */
export async function listarSuscripciones(repositorio, usuario, filtros = {}) {
  exigirAdmin(usuario);
  const lista = await repositorio.suscripcionesCorreo({
    estado: filtros.estado || null,
    municipioId: filtros.municipioId || null,
    limite: filtros.limite || 500
  });
  // El token de baja no se expone en la API de administración.
  return lista.map(({ token, ...resto }) => resto);
}

/* --------------------------------- campañas -------------------------------- */

/** Normaliza el segmento: todos, un municipio o un estado. */
export function normalizarSegmento(datos = {}) {
  if (datos.todos === true) return { todos: true };
  const municipioId = texto(datos.municipioId, 'municipioId', { max: 64 });
  if (municipioId) return { todos: false, municipioId };
  const estado = texto(datos.estado, 'estado', { max: 120 });
  if (estado) return { todos: false, estado };
  return { todos: true };
}

async function correosDelSegmento(repositorio, segmento) {
  const activas = await repositorio.suscripcionesCorreo({ estado: 'activa', limite: 2000 });
  if (segmento.todos) return activas;
  if (segmento.municipioId) {
    return activas.filter((s) => s.municipioId === segmento.municipioId);
  }
  if (segmento.estado) {
    const municipios = await repositorio.todosMunicipios();
    const ids = new Set(municipios.filter((m) => m.estado === segmento.estado).map((m) => m.id));
    return activas.filter((s) => s.municipioId && ids.has(s.municipioId));
  }
  return activas;
}

/** Crea una campaña en borrador (todavía no envía nada). */
export async function crearCampana(repositorio, usuario, datos = {}) {
  exigirAdmin(usuario);
  const campana = {
    id: nuevoId(),
    nombre: texto(datos.nombre, 'nombre', { requerido: true, max: 160 }),
    asunto: texto(datos.asunto, 'asunto', { requerido: true, max: 200 }),
    html: texto(datos.html, 'html', { requerido: true, max: 20000 }),
    texto: texto(datos.texto, 'texto', { max: 8000 }),
    segmento: normalizarSegmento(datos.segmento || datos),
    estado: 'borrador',
    total: 0,
    enviados: 0,
    errores: 0,
    creadoPor: usuario.username,
    creadoEn: new Date().toISOString(),
    enviadaEn: null
  };
  await repositorio.crearCampana(campana);
  return campana;
}

/** Edición limitada a borradores: una campaña enviada no se reescribe. */
export async function actualizarCampana(repositorio, usuario, id, datos = {}) {
  exigirAdmin(usuario);
  const campana = await repositorio.campanaPorId(id);
  if (!campana) throw AppError.noEncontrado('Campaña no encontrada');
  if (campana.estado !== 'borrador') {
    throw AppError.solicitudInvalida('Solo se pueden editar campañas en borrador');
  }
  return repositorio.actualizarCampana(id, {
    nombre: datos.nombre !== undefined ? texto(datos.nombre, 'nombre', { requerido: true, max: 160 }) : undefined,
    asunto: datos.asunto !== undefined ? texto(datos.asunto, 'asunto', { requerido: true, max: 200 }) : undefined,
    html: datos.html !== undefined ? texto(datos.html, 'html', { requerido: true, max: 20000 }) : undefined,
    texto: datos.texto !== undefined ? texto(datos.texto, 'texto', { max: 8000 }) : undefined,
    segmento:
      datos.segmento !== undefined || datos.todos !== undefined
        ? normalizarSegmento(datos.segmento || datos)
        : undefined
  });
}

export async function listarCampanas(repositorio, usuario, filtros = {}) {
  exigirAdmin(usuario);
  return repositorio.campanasCorreo({ limite: filtros.limite || 100 });
}

export async function detalleCampana(repositorio, usuario, id) {
  exigirAdmin(usuario);
  const campana = await repositorio.campanaPorId(id);
  if (!campana) throw AppError.noEncontrado('Campaña no encontrada');
  const destinatarios = await repositorio.destinatariosCampana(id);
  return { campana, destinatarios };
}

/** Envío de prueba a una sola dirección, sin tocar las suscripciones. */
export async function enviarPrueba(repositorio, usuario, id, correo) {
  exigirAdmin(usuario);
  const campana = await repositorio.campanaPorId(id);
  if (!campana) throw AppError.noEncontrado('Campaña no encontrada');
  const destino = normalizarCorreo(correo);
  if (!destino) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo: 'correo', mensaje: 'Escribe un correo válido' }
    ]);
  }
  const resultado = await enviarCampanaCorreo(repositorio, {
    para: destino,
    asunto: `[Prueba] ${campana.asunto}`,
    html: `<p style="font-size:12px;color:#64748b">Este es un envío de prueba.</p>${campana.html}`,
    texto: campana.texto,
    tokenBaja: 'prueba'
  });
  return { enviado: resultado.ok, simulado: resultado.simulado === true };
}

/**
 * Prepara los destinatarios y lanza el envío por lotes.
 * Responde de inmediato: el progreso se consulta con `detalleCampana`.
 */
export async function enviarCampana(repositorio, usuario, id) {
  exigirAdmin(usuario);
  const campana = await repositorio.campanaPorId(id);
  if (!campana) throw AppError.noEncontrado('Campaña no encontrada');
  if (campana.estado === 'enviando') {
    throw AppError.solicitudInvalida('La campaña ya se está enviando');
  }
  if (campana.estado === 'enviada') {
    throw AppError.solicitudInvalida('La campaña ya se envió');
  }

  const suscripciones = await correosDelSegmento(repositorio, campana.segmento || { todos: true });
  const ahora = new Date().toISOString();
  const destinatarios = [];
  for (const suscripcion of suscripciones) {
    const bloqueo = await repositorio.bloqueoVigente({ correo: suscripcion.correo });
    if (bloqueo) continue;
    destinatarios.push({
      id: nuevoId(),
      campanaId: campana.id,
      correo: suscripcion.correo,
      suscripcionId: suscripcion.id,
      tokenBaja: suscripcion.token,
      estado: 'pendiente',
      error: '',
      enviadoEn: null,
      creadoEn: ahora
    });
  }

  if (!destinatarios.length) {
    throw AppError.solicitudInvalida(
      'No hay suscriptores confirmados en ese segmento. Invita primero desde la página de informes.'
    );
  }

  await repositorio.guardarDestinatariosCampana(campana.id, destinatarios);
  await repositorio.actualizarCampana(campana.id, {
    estado: 'enviando',
    total: destinatarios.length,
    enviados: 0,
    errores: 0
  });

  // El envío corre en segundo plano para no bloquear la petición.
  procesarCampana(repositorio, campana.id).catch((error) => {
    console.error('[campanas] error al procesar:', error.message);
  });
  return { ...campana, estado: 'enviando', total: destinatarios.length };
}

/**
 * Recorre los destinatarios pendientes y los envía uno a uno.
 * Si la campaña ya se está procesando, devuelve esa misma promesa para que
 * quien llame pueda esperar el final sin lanzar un segundo envío.
 * Exportada para las pruebas y para el trabajador.
 */
export function procesarCampana(repositorio, campanaId) {
  if (enCurso.has(campanaId)) return enCurso.get(campanaId);
  const tarea = (async () => {
    try {
      const campana = await repositorio.campanaPorId(campanaId);
      if (!campana) return;
      const destinatarios = await repositorio.destinatariosCampana(campanaId);
      let enviados = 0;
      let errores = 0;

      for (const destinatario of destinatarios) {
        const actual = await repositorio.suscripcionPorCorreo(destinatario.correo);
        if (!actual || actual.estado !== 'activa') {
          await repositorio.actualizarDestinatarioCampana(destinatario.id, {
            estado: 'omitido',
            error: 'La suscripción ya no está activa'
          });
          continue;
        }

        const resultado = await enviarCampanaCorreo(repositorio, {
          para: destinatario.correo,
          asunto: campana.asunto,
          html: campana.html,
          texto: campana.texto,
          tokenBaja: destinatario.tokenBaja || actual.token
        });

        if (resultado.ok) {
          enviados += 1;
          await repositorio.actualizarDestinatarioCampana(destinatario.id, {
            estado: 'enviado',
            error: '',
            enviadoEn: new Date().toISOString()
          });
        } else {
          errores += 1;
          await repositorio.actualizarDestinatarioCampana(destinatario.id, {
            estado: 'error',
            error: String(resultado.error?.message || 'No se pudo enviar').slice(0, 400)
          });
        }
      }

      await repositorio.actualizarCampana(campanaId, {
        estado: 'enviada',
        enviados,
        errores,
        enviadaEn: new Date().toISOString()
      });
    } finally {
      enCurso.delete(campanaId);
    }
  })();
  enCurso.set(campanaId, tarea);
  return tarea;
}

/** Resumen para las tarjetas del panel. */
export async function resumen(repositorio, usuario) {
  exigirAdmin(usuario);
  const [activas, pendientes, bajas, campanas] = await Promise.all([
    repositorio.suscripcionesCorreo({ estado: 'activa', limite: 2000 }),
    repositorio.suscripcionesCorreo({ estado: 'pendiente', limite: 2000 }),
    repositorio.suscripcionesCorreo({ estado: 'baja', limite: 2000 }),
    repositorio.campanasCorreo({ limite: 500 })
  ]);
  return {
    suscripciones: {
      activas: activas.length,
      pendientes: pendientes.length,
      bajas: bajas.length
    },
    campanas: {
      total: campanas.length,
      enviadas: campanas.filter((c) => c.estado === 'enviada').length,
      borradores: campanas.filter((c) => c.estado === 'borrador').length
    }
  };
}
