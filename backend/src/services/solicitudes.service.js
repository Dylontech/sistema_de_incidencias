/**
 * SERVICIO: solicitudes públicas de informes.
 *
 * Flujo: formulario → correo de verificación (doble opt-in) → cola → PDF/CSV
 * → correo con el adjunto. Los bloqueos son reversibles y pueden caducar.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../utils/AppError.js';
import { config } from '../config/index.js';
import { nuevoId } from '../utils/ids.js';
import { normalizarCorreo } from '../models/usuario.model.js';
import { datosInforme, generarCSV, nombreArchivo } from './informes.service.js';
import { generarPDF } from './pdf.service.js';
import { enviarInforme, enviarVerificacion } from './correo.service.js';
import { emitir } from './notificaciones.service.js';
import { valor as valorConfig } from './configuracion.service.js';

const ESTADOS_ABIERTOS = ['pendiente_verificacion', 'pendiente', 'procesando'];

/** Hash de la IP: no se guarda la dirección en claro. */
function hashIp(ip) {
  return crypto
    .createHash('sha256')
    .update(`${config.jwt.secret}|${String(ip || '')}`)
    .digest('hex');
}

function fechaValida(valor, campo) {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo, mensaje: 'Usa el formato AAAA-MM-DD' }
    ]);
  }
  return texto;
}

function folioNuevo() {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const azar = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `INF-${fecha}-${azar}`;
}

function tokenNuevo() {
  return crypto.randomBytes(24).toString('hex');
}

/** Resumen legible para avisos cuando la solicitud cubre varios territorios. */
function resumenTerritorio(solicitud) {
  const estados = Array.isArray(solicitud.estados) ? solicitud.estados : [];
  const municipios = Array.isArray(solicitud.municipios) ? solicitud.municipios : [];
  const partes = [];
  if (estados.length) partes.push(estados.join(', '));
  if (municipios.length) partes.push(`${municipios.length} municipio(s)`);
  return partes.join(' + ') || 'Sin territorio';
}

function texto(valor, campo, { requerido = false, max = 200 } = {}) {
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

/** Valida y guarda la solicitud; envía el correo de confirmación. */
export async function crearSolicitud(repositorio, datos = {}, { ip = '', userAgent = '' } = {}) {
  const nombre = texto(datos.nombre, 'nombre', { requerido: true, max: 120 });
  const correo = normalizarCorreo(datos.correo);
  if (!correo) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo: 'correo', mensaje: 'Escribe un correo válido' }
    ]);
  }
  if (datos.aceptaTerminos !== true) {
    throw AppError.solicitudInvalida('Debes aceptar el aviso de privacidad y los términos');
  }

  const formato = datos.formato === 'csv' ? 'csv' : 'pdf';
  const municipios = Array.isArray(datos.municipios)
    ? [...new Set(datos.municipios.map((m) => String(m).slice(0, 64)).filter(Boolean))]
    : texto(datos.municipioId, 'municipioId', { max: 64 })
      ? [texto(datos.municipioId, 'municipioId', { max: 64 })]
      : [];
  const estados = Array.isArray(datos.estados)
    ? [...new Set(datos.estados.map((e) => String(e).slice(0, 120)).filter(Boolean))]
    : texto(datos.estadoEntidad, 'estadoEntidad', { max: 120 })
      ? [texto(datos.estadoEntidad, 'estadoEntidad', { max: 120 })]
      : [];
  if (!municipios.length && !estados.length) {
    throw AppError.solicitudInvalida('Elige al menos un municipio o un estado para el informe');
  }
  // No truncar en silencio: si alguien selecciona demasiados territorios, el
  // informe debe rechazarse con un mensaje claro antes de generar un archivo
  // incompleto. Un estado añadido cuenta como «todo el estado», no como 113
  // municipios, así que estos límites son holgados.
  if (municipios.length > 250 || estados.length > 32) {
    throw AppError.solicitudInvalida(
      'La selección territorial es demasiado grande. Usa estados completos o reduce los municipios.'
    );
  }

  const desde = fechaValida(datos.desde, 'desde');
  const hasta = fechaValida(datos.hasta, 'hasta');
  const hoy = new Date().toISOString().slice(0, 10);
  if (desde && desde > hoy) throw AppError.solicitudInvalida('La fecha inicial no puede ser futura');
  if (hasta && hasta > hoy) throw AppError.solicitudInvalida('La fecha final no puede ser futura');
  if (desde && hasta && desde > hasta) {
    throw AppError.solicitudInvalida('La fecha inicial no puede ser posterior a la final');
  }
  const fechaMinima = await valorConfig(repositorio, 'informes.fecha_minima');
  if (desde && desde < fechaMinima) {
    throw AppError.solicitudInvalida(`La fecha inicial no puede ser anterior a ${fechaMinima}`);
  }
  const maxMeses = await valorConfig(repositorio, 'informes.max_meses');
  if (desde && hasta) {
    const inicio = new Date(`${desde}T00:00:00Z`);
    const fin = new Date(`${hasta}T00:00:00Z`);
    const meses = (fin.getFullYear() - inicio.getFullYear()) * 12 + (fin.getMonth() - inicio.getMonth());
    if (meses > maxMeses) {
      throw AppError.solicitudInvalida(`El rango no puede superar ${maxMeses} meses`);
    }
  }

  const ambito = texto(datos.ambito, 'ambito', { max: 40 }) || 'todos';
  const ambitos = Array.isArray(datos.ambitos)
    ? [...new Set(datos.ambitos.map((a) => String(a).slice(0, 40)).filter(Boolean))].slice(0, 10)
    : ambito !== 'todos'
      ? [ambito]
      : [];
  const tiposTodos = datos.tiposTodos === true;
  const tipos = tiposTodos
    ? []
    : Array.isArray(datos.tipos)
      ? [...new Set(datos.tipos.map((t) => String(t).slice(0, 120)).filter(Boolean))].slice(0, 30)
      : [];
  if (!tiposTodos && !tipos.length) {
    throw AppError.solicitudInvalida('Selecciona al menos un tipo de incidencia o «todos»');
  }
  const municipioId = municipios.length === 1 ? municipios[0] : null;
  const estadoEntidad = estados.length === 1 ? estados[0] : null;

  const ipHash = hashIp(ip);
  const bloqueo = await repositorio.bloqueoVigente({ correo, ipHash });
  if (bloqueo) {
    throw AppError.prohibido(
      `No podemos atender solicitudes desde este correo en este momento. Motivo: ${
        bloqueo.motivo || 'incumplimiento de los términos'
      }. Puedes pedir la revisión al administrador del sistema.`
    );
  }

  // Una sola solicitud abierta por correo evita duplicados y spam.
  const abiertas = await repositorio.solicitudesInforme({ correo, limite: 20 });
  const pendiente = abiertas.find((s) => ESTADOS_ABIERTOS.includes(s.estado));
  if (pendiente) {
    throw AppError.conflicto(
      `Ya tienes una solicitud en curso (${pendiente.folio}). Revisa tu correo o espera a que se procese.`
    );
  }

  let folio = folioNuevo();
  while (await repositorio.solicitudInformePorFolio(folio)) folio = folioNuevo();

  const solicitud = {
    id: nuevoId(),
    folio,
    nombre,
    correo,
    telefono: texto(datos.telefono, 'telefono', { max: 40 }) || null,
    municipioId,
    estadoEntidad,
    municipios,
    estados,
    ambito,
    ambitos,
    tiposTodos,
    desde: desde ? `${desde}T00:00:00.000Z` : null,
    hasta: hasta ? `${hasta}T23:59:59.000Z` : null,
    tipos,
    formato,
    mensaje: texto(datos.mensaje, 'mensaje', { max: 600 }),
    estado: 'pendiente_verificacion',
    tokenVerificacion: tokenNuevo(),
    verificadoEn: null,
    intentos: 0,
    error: '',
    ipHash,
    userAgent: String(userAgent || '').slice(0, 255),
    aceptaTerminos: true,
    creadoEn: new Date().toISOString(),
    procesadoEn: null
  };

  await repositorio.crearSolicitudInforme(solicitud);
  await enviarVerificacion(repositorio, solicitud);

  await emitir(repositorio, {
    evento: 'solicitud_informe_creada',
    titulo: '📄 Nueva solicitud de informe público',
    mensaje: `${solicitud.folio} · ${resumenTerritorio(solicitud)} (${solicitud.formato.toUpperCase()})`,
    severidad: 'info',
    entidadTipo: 'solicitud_informe',
    entidadId: solicitud.id,
    municipioId: solicitud.municipioId,
    estadoEntidad: solicitud.estadoEntidad,
    url: '/?admin=solicitudes-informe',
    claveDedupe: `solicitud_informe_creada:${solicitud.id}`
  });

  return {
    folio,
    estado: solicitud.estado,
    correo: correo.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
    mensaje: 'Revisa tu correo y confirma la solicitud para que podamos generar el informe.'
  };
}

/** Confirma el correo y deja la solicitud en la cola. */
export async function verificarSolicitud(repositorio, token) {
  const solicitud = await repositorio.solicitudInformePorToken(String(token || ''));
  if (!solicitud) throw AppError.noEncontrado('El enlace de confirmación no es válido o ya se usó.');
  if (solicitud.estado !== 'pendiente_verificacion') {
    return { folio: solicitud.folio, estado: solicitud.estado, yaVerificada: true };
  }

  const actualizada = await repositorio.actualizarSolicitudInforme(solicitud.id, {
    estado: 'pendiente',
    verificadoEn: new Date().toISOString(),
    tokenVerificacion: null
  });

  // Dispara el procesamiento sin esperar al siguiente ciclo del trabajador.
  procesarPendientes(repositorio).catch((error) => {
    console.error('[solicitudes] error al procesar:', error.message);
  });

  return { folio: actualizada.folio, estado: actualizada.estado, yaVerificada: false };
}

/** Consulta pública por folio + correo (nunca devuelve datos personales). */
export async function consultarSolicitud(repositorio, folio, correo) {
  const email = normalizarCorreo(correo);
  if (!folio || !email) {
    throw AppError.solicitudInvalida('Escribe el folio y el correo con el que solicitaste el informe');
  }
  const solicitud = await repositorio.solicitudInformePorFolio(folio);
  if (!solicitud || solicitud.correo !== email) {
    throw AppError.noEncontrado('No encontramos una solicitud con esos datos');
  }
  return {
    folio: solicitud.folio,
    estado: solicitud.estado,
    formato: solicitud.formato,
    creadoEn: solicitud.creadoEn,
    procesadoEn: solicitud.procesadoEn,
    intentos: solicitud.intentos,
    error: solicitud.estado === 'error' ? 'No se pudo generar el informe. El administrador lo revisará.' : ''
  };
}

/** Cola del administrador. */
export async function listarSolicitudes(repositorio, filtros = {}) {
  return repositorio.solicitudesInforme(filtros);
}

/** Rechazo motivado (no genera informe). */
export async function rechazarSolicitud(repositorio, actor, id, motivo = '') {
  const solicitud = await repositorio.solicitudInformePorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  return repositorio.actualizarSolicitudInforme(id, {
    estado: 'rechazada',
    error: String(motivo || 'Rechazada por el administrador').slice(0, 800),
    procesadoEn: new Date().toISOString()
  });
}

/** Reintenta una solicitud que quedó en error. */
export async function reintentarSolicitud(repositorio, id) {
  const solicitud = await repositorio.solicitudInformePorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  return repositorio.actualizarSolicitudInforme(id, {
    estado: 'pendiente',
    intentos: 0,
    error: ''
  });
}

export async function bloquear(repositorio, actor, { correo, ipHash, motivo, hasta = null }) {
  const email = normalizarCorreo(correo);
  if (!email && !ipHash) {
    throw AppError.solicitudInvalida('Indica un correo o una IP para bloquear');
  }
  const bloqueo = {
    id: nuevoId(),
    correo: email || null,
    ipHash: ipHash || null,
    motivo: String(motivo || 'Incumplimiento de los términos del servicio').slice(0, 300),
    activo: true,
    hasta,
    creadoPor: actor?.username || null,
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearBloqueo(bloqueo);
  return bloqueo;
}

export async function desbloquear(repositorio, actor, id) {
  const resultado = await repositorio.desactivarBloqueo(id, { por: actor?.username });
  if (!resultado) throw AppError.noEncontrado('Bloqueo no encontrado');
  return { desbloqueado: true, id };
}

export async function listarBloqueos(repositorio, filtros = {}) {
  return repositorio.listarBloqueos(filtros);
}

function nombreAdjunto(datos, solicitud, formato) {
  const base = nombreArchivo(datos, formato);
  const extension = `.${formato}`;
  const conFolio = base.endsWith(extension)
    ? `${base.slice(0, -extension.length)}-${solicitud.folio}${extension}`
    : `${base}-${solicitud.folio}`;
  return conFolio.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function adjuntoDeSolicitud(solicitud, datos) {
  const nombre = nombreAdjunto(datos, solicitud, solicitud.formato);
  if (solicitud.formato === 'csv') {
    return {
      nombre,
      tipo: 'text/csv; charset=utf-8',
      contenido: Buffer.from(generarCSV(datos), 'utf8')
    };
  }
  return null;
}

async function guardarAdjunto(adjunto) {
  const carpeta = path.join(config.paths.data, 'informes');
  await fs.mkdir(carpeta, { recursive: true });
  const nombre = path.basename(adjunto.nombre);
  await fs.writeFile(path.join(carpeta, nombre), adjunto.contenido);
  return nombre;
}

function tipoDeAdjunto(solicitud) {
  return solicitud.formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf';
}

async function datosDeSolicitud(repositorio, solicitud) {
  return datosInforme(
    repositorio,
    {
      municipioId: solicitud.municipioId,
      municipios: solicitud.municipios,
      estadoEntidad: solicitud.estadoEntidad,
      estados: solicitud.estados,
      ambito: solicitud.ambito,
      ambitos: solicitud.ambitos,
      tipos: solicitud.tipos,
      tiposTodos: solicitud.tiposTodos,
      desde: solicitud.desde,
      hasta: solicitud.hasta
    },
    { publico: true }
  );
}

async function adjuntoCompleto(repositorio, solicitud, datos) {
  return (
    adjuntoDeSolicitud(solicitud, datos) || {
      nombre: nombreAdjunto(datos, solicitud, 'pdf'),
      tipo: 'application/pdf',
      contenido: await generarPDF(datos)
    }
  );
}

/** Detalle de una solicitud (admin). */
export async function detalleSolicitud(repositorio, id) {
  const solicitud = await repositorio.solicitudInformePorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  return solicitud;
}

/** Genera el adjunto sin guardarlo (para vista previa). */
export async function vistaPreviaSolicitud(repositorio, id, formato = null) {
  const solicitud = await repositorio.solicitudInformePorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  const datos = await datosDeSolicitud(repositorio, solicitud);
  const elegido = formato === 'csv' || formato === 'pdf' ? formato : solicitud.formato;
  const adjunto = await adjuntoCompleto(repositorio, { ...solicitud, formato: elegido }, datos);
  return { solicitud, datos, adjunto };
}

/** Genera y guarda el archivo en data/informes (admin). */
export async function generarSolicitud(repositorio, actor, id) {
  const solicitud = await repositorio.solicitudInformePorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  const datos = await datosDeSolicitud(repositorio, solicitud);
  const adjunto = await adjuntoCompleto(repositorio, solicitud, datos);
  const archivo = await guardarAdjunto(adjunto);
  const actualizada = await repositorio.actualizarSolicitudInforme(id, {
    archivo,
    generadoEn: new Date().toISOString(),
    estado: 'generada',
    error: ''
  });
  return { solicitud: actualizada, archivo, tamano: adjunto.contenido.length };
}

/** Devuelve el archivo ya generado; si falta, lo regenera y lo guarda. */
export async function archivoSolicitud(repositorio, id) {
  const solicitud = await repositorio.solicitudInformePorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');

  if (solicitud.archivo) {
    const nombre = path.basename(solicitud.archivo);
    try {
      const contenido = await fs.readFile(path.join(config.paths.data, 'informes', nombre));
      return {
        solicitud,
        adjunto: { nombre, tipo: tipoDeAdjunto(solicitud), contenido }
      };
    } catch {
      // El archivo se borró o el registro viene de una versión anterior:
      // se regenera más abajo con el mismo folio.
    }
  }

  const datos = await datosDeSolicitud(repositorio, solicitud);
  const adjunto = await adjuntoCompleto(repositorio, solicitud, datos);
  const archivo = await guardarAdjunto(adjunto);
  const actualizada = await repositorio.actualizarSolicitudInforme(id, {
    archivo,
    generadoEn: new Date().toISOString(),
    estado: solicitud.estado === 'enviada' ? 'enviada' : 'generada',
    error: ''
  });
  return { solicitud: actualizada || { ...solicitud, archivo }, adjunto };
}

/** Envía el informe generado (admin). */
export async function enviarSolicitud(repositorio, actor, id) {
  const solicitud = await repositorio.solicitudInformePorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  let adjunto = null;
  if (solicitud.archivo) {
    const archivo = path.join(config.paths.data, 'informes', path.basename(solicitud.archivo));
    try {
      const contenido = await fs.readFile(archivo);
      adjunto = {
        nombre: solicitud.archivo,
        tipo: solicitud.formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf',
        contenido
      };
    } catch {
      adjunto = null;
    }
  }
  if (!adjunto) {
    const generado = await generarSolicitud(repositorio, actor, id);
    const archivo = path.join(config.paths.data, 'informes', generado.archivo);
    const contenido = await fs.readFile(archivo);
    adjunto = {
      nombre: generado.archivo,
      tipo: solicitud.formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf',
      contenido
    };
  }
  const envio = await enviarInforme(repositorio, solicitud, adjunto);
  if (!envio.ok) throw new Error(envio.error?.message || 'No se pudo enviar el correo');
  const actualizada = await repositorio.actualizarSolicitudInforme(id, {
    estado: 'enviada',
    enviadoEn: new Date().toISOString(),
    procesadoEn: new Date().toISOString(),
    error: ''
  });
  await emitir(repositorio, {
    evento: 'solicitud_informe_enviada',
    titulo: '📧 Informe enviado manualmente',
    mensaje: `${solicitud.folio} se envió a ${solicitud.correo}.`,
    severidad: 'exito',
    entidadTipo: 'solicitud_informe',
    entidadId: id,
    municipioId: solicitud.municipioId,
    estadoEntidad: solicitud.estadoEntidad,
    claveDedupe: `solicitud_informe_enviada_manual:${id}:${Date.now()}`
  });
  return actualizada;
}

/**
 * Procesa hasta tres solicitudes pendientes. Se llama al verificar y desde el
 * trabajador periódico. Es idempotente: cada solicitud se marca `procesando`
 * antes de generar el archivo y un candado evita que dos ciclos simultáneos
 * envíen el mismo informe dos veces.
 */
let procesandoAhora = false;

export async function procesarPendientes(repositorio) {
  if (procesandoAhora) return [];
  procesandoAhora = true;

  try {
    const pendientes = await repositorio.solicitudesInforme({ estado: 'pendiente', limite: 3 });
    const procesadas = [];

    for (const solicitud of pendientes) {
      await repositorio.actualizarSolicitudInforme(solicitud.id, { estado: 'procesando', error: '' });
      try {
        const datos = await datosInforme(
          repositorio,
          {
            municipioId: solicitud.municipioId,
            municipios: solicitud.municipios,
            estadoEntidad: solicitud.estadoEntidad,
            estados: solicitud.estados,
            ambito: solicitud.ambito,
            ambitos: solicitud.ambitos,
            tipos: solicitud.tipos,
            tiposTodos: solicitud.tiposTodos,
            desde: solicitud.desde,
            hasta: solicitud.hasta
          },
          { publico: true }
        );

        const adjunto =
          adjuntoDeSolicitud(solicitud, datos) ||
          {
            nombre: nombreAdjunto(datos, solicitud, 'pdf'),
            tipo: 'application/pdf',
            contenido: await generarPDF(datos)
          };

        const archivo = await guardarAdjunto(adjunto);
        await repositorio.actualizarSolicitudInforme(solicitud.id, {
          archivo,
          generadoEn: new Date().toISOString()
        });

        const envio = await enviarInforme(repositorio, solicitud, adjunto);
        if (!envio.ok) throw new Error(envio.error?.message || 'No se pudo enviar el correo');

        await repositorio.actualizarSolicitudInforme(solicitud.id, {
          estado: 'enviada',
          procesadoEn: new Date().toISOString(),
          enviadoEn: new Date().toISOString(),
          error: ''
        });
        procesadas.push({ folio: solicitud.folio, estado: 'enviada' });
        await emitir(repositorio, {
          evento: 'solicitud_informe_enviada',
          titulo: '📧 Informe público enviado',
          mensaje: `${solicitud.folio} se envió a ${solicitud.correo}.`,
          severidad: 'exito',
          entidadTipo: 'solicitud_informe',
          entidadId: solicitud.id,
          municipioId: solicitud.municipioId,
          estadoEntidad: solicitud.estadoEntidad,
          claveDedupe: `solicitud_informe_enviada:${solicitud.id}`
        }).catch(() => {});
      } catch (error) {
        const intentos = Number(solicitud.intentos || 0) + 1;
        const agotado = intentos >= config.correo.maxReintentos;
        await repositorio.actualizarSolicitudInforme(solicitud.id, {
          estado: agotado ? 'error' : 'pendiente',
          intentos,
          error: String(error.message || 'Error al generar el informe').slice(0, 800)
        });
        procesadas.push({ folio: solicitud.folio, estado: agotado ? 'error' : 'pendiente' });
        if (agotado) {
          await emitir(repositorio, {
            evento: 'solicitud_informe_error',
            titulo: '⚠️ Falló un informe público',
            mensaje: `${solicitud.folio}: ${String(error.message || '').slice(0, 160)}`,
            severidad: 'error',
            entidadTipo: 'solicitud_informe',
            entidadId: solicitud.id,
            municipioId: solicitud.municipioId,
            estadoEntidad: solicitud.estadoEntidad,
            claveDedupe: `solicitud_informe_error:${solicitud.id}:${intentos}`
          }).catch(() => {});
        }
      }
    }

    return procesadas;
  } finally {
    procesandoAhora = false;
  }
}

/** Trabajador periódico (en proceso; se detiene con el servidor). */
export function iniciarTrabajador(repositorio, { intervaloMs = 30000 } = {}) {
  const temporizador = setInterval(async () => {
    try {
      await procesarPendientes(repositorio);
    } catch (error) {
      console.error('[solicitudes] trabajador:', error.message);
    }
  }, intervaloMs);
  temporizador.unref?.();
  return () => clearInterval(temporizador);
}
