/**
 * SERVICIO: mensajería interna entre el personal (admin↔funcionario/auditor).
 *
 * Cada hilo es un conjunto de mensajes con el mismo `hilo`. Un mensaje puede
 * dirigirse a una cuenta concreta o difundirse a un municipio/estado.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { alcanceDe, esAdmin, esEmpleado } from './alcance.service.js';
import { adjuntosDe, vincularAdjuntos } from './adjuntos.service.js';
import { enviarMensajeDirecto } from './correo.service.js';
import { emitir } from './notificaciones.service.js';

function texto(valor, campo, { requerido = false, max = 2000 } = {}) {
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

function participantes(mensajes) {
  const set = new Set();
  for (const m of mensajes) {
    set.add(m.deUsuario);
    if (m.paraUsuario) set.add(m.paraUsuario);
  }
  return set;
}

/** Envía un mensaje nuevo o responde dentro de un hilo. */
export async function enviar(repositorio, usuario, datos = {}) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('La mensajería es solo para el personal del sistema');
  }

  const adjuntos = Array.isArray(datos.adjuntos) ? [...new Set(datos.adjuntos.map(String))].slice(0, 3) : [];
  const asunto = texto(datos.asunto, 'asunto', { requerido: !datos.hilo, max: 160 });
  const cuerpo = texto(datos.cuerpo, 'cuerpo', { requerido: adjuntos.length === 0, max: 4000 });

  let paraUsuario = datos.paraUsuario ? String(datos.paraUsuario) : null;
  const paraMunicipio = datos.paraMunicipio ? String(datos.paraMunicipio) : null;
  const paraEstado = datos.paraEstado ? String(datos.paraEstado) : null;
  let hilo = datos.hilo ? String(datos.hilo) : null;

  if (hilo) {
    const existentes = await repositorio.mensajesDirectos({ hilo, limite: 1000 });
    if (!existentes.length) throw AppError.noEncontrado('Hilo no encontrado');
    const participantesHilo = participantes(existentes);
    if (!esAdmin(usuario) && !participantesHilo.has(usuario.username)) {
      throw AppError.prohibido('No participas en este hilo');
    }
    if (!paraUsuario) {
      paraUsuario =
        [...participantesHilo].find((u) => u !== usuario.username) || null;
    }
  }

  if (!paraUsuario && !paraMunicipio && !paraEstado) {
    throw AppError.solicitudInvalida('Elige un destinatario, un municipio o un estado');
  }

  // Solo el admin puede difundir a un territorio completo.
  if ((paraMunicipio || paraEstado) && !esAdmin(usuario)) {
    throw AppError.prohibido('Solo un administrador puede enviar a todo un municipio o estado');
  }

  let destinatario = null;
  if (paraUsuario) {
    destinatario = await repositorio.usuarioPorUsername(paraUsuario);
    if (!destinatario || !esEmpleado(destinatario)) {
      throw AppError.solicitudInvalida('El destinatario no es una cuenta del personal');
    }
    if (destinatario.username === usuario.username) {
      throw AppError.solicitudInvalida('No puedes enviarte un mensaje a ti mismo');
    }
  }

  if (!hilo) hilo = nuevoId();

  const mensaje = {
    id: nuevoId(),
    hilo,
    deUsuario: usuario.username,
    deNombre: usuario.nombre,
    deRol: usuario.rol,
    paraUsuario,
    paraMunicipio,
    paraEstado,
    asunto,
    cuerpo,
    leido: false,
    creadoEn: new Date().toISOString()
  };

  await repositorio.crearMensajeDirecto(mensaje);
  if (adjuntos.length) {
    await vincularAdjuntos(repositorio, usuario, adjuntos, {
      contextoTipo: 'mensaje_directo',
      contextoId: mensaje.id,
      proposito: 'chat'
    });
    const mapa = await adjuntosDe(repositorio, 'mensaje_directo', [mensaje.id]);
    mensaje.adjuntos = mapa.get(mensaje.id) || [];
  }

  if (destinatario) {
    await emitir(repositorio, {
      evento: 'mensaje_directo',
      titulo: `💬 Mensaje de ${usuario.nombre}`,
      mensaje: asunto,
      severidad: 'info',
      entidadTipo: 'mensaje',
      entidadId: hilo,
      url: '/?bandeja=mensajes',
      paraUsuarios: [destinatario.username],
      claveDedupe: `mensaje_directo:${mensaje.id}`
    });
    if (destinatario.correo) {
      await enviarMensajeDirecto(repositorio, {
        para: destinatario.correo,
        asunto,
        deNombre: usuario.nombre,
        cuerpo
      });
    }
  } else if (paraMunicipio || paraEstado) {
    // Difusión: antes solo se guardaba en la tabla y nadie se enteraba.
    await emitir(repositorio, {
      evento: 'difusion_personal',
      titulo: `📣 ${asunto}`,
      mensaje: `${usuario.nombre}: ${cuerpo.slice(0, 140)}`,
      severidad: 'info',
      entidadTipo: 'mensaje',
      entidadId: hilo,
      municipioId: paraMunicipio,
      estadoEntidad: paraEstado,
      url: '/?bandeja=mensajes',
      excluir: [usuario.username],
      claveDedupe: `difusion_personal:${mensaje.id}`
    });
  }

  return mensaje;
}

function resumenHilo(mensajes, usuario) {
  const ordenados = mensajes.slice().sort((a, b) => new Date(a.creadoEn) - new Date(b.creadoEn));
  const ultimo = ordenados[ordenados.length - 1];
  const noLeidos = ordenados.filter(
    (m) => !m.leido && m.paraUsuario === usuario.username
  ).length;
  return {
    hilo: ultimo.hilo,
    asunto: ultimo.asunto,
    ultimoMensaje: ultimo.cuerpo.slice(0, 140),
    ultimoDe: ultimo.deNombre,
    ultimaFecha: ultimo.creadoEn,
    noLeidos
  };
}

/** Bandeja: hilos visibles para el usuario, con no leídos. */
export async function bandeja(repositorio, usuario) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('La mensajería es solo para el personal del sistema');
  }
  const alcance = alcanceDe(usuario);
  const municipios = alcance.municipios ? [...alcance.municipios] : [];
  const estados = alcance.estados ? [...alcance.estados] : [];

  const mensajes = await repositorio.mensajesDirectos({
    usuario: usuario.username,
    esAdmin: esAdmin(usuario),
    municipios,
    estados,
    limite: 1000
  });

  const porHilo = new Map();
  for (const mensaje of mensajes) {
    if (!porHilo.has(mensaje.hilo)) porHilo.set(mensaje.hilo, []);
    porHilo.get(mensaje.hilo).push(mensaje);
  }

  return [...porHilo.values()]
    .map((grupo) => resumenHilo(grupo, usuario))
    .sort((a, b) => new Date(b.ultimaFecha) - new Date(a.ultimaFecha));
}

/** Mensajes de un hilo; al abrirlo se marcan como leídos los dirigidos a mí. */
export async function hilo(repositorio, usuario, hiloId) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('La mensajería es solo para el personal del sistema');
  }
  const mensajes = await repositorio.mensajesDirectos({ hilo: hiloId, limite: 1000 });
  if (!mensajes.length) throw AppError.noEncontrado('Hilo no encontrado');

  const participantesHilo = participantes(mensajes);
  if (!esAdmin(usuario) && !participantesHilo.has(usuario.username)) {
    throw AppError.prohibido('No participas en este hilo');
  }

  for (const mensaje of mensajes) {
    if (!mensaje.leido && mensaje.paraUsuario === usuario.username) {
      await repositorio.marcarMensajeLeido(mensaje.id, usuario.username);
    }
  }
  const mapa = await adjuntosDe(repositorio, 'mensaje_directo', mensajes.map((m) => m.id));
  return mensajes.map((mensaje) => ({ ...mensaje, adjuntos: mapa.get(mensaje.id) || [] }));
}

export async function marcarLeido(repositorio, usuario, id) {
  const mensaje = await repositorio.marcarMensajeLeido(id, usuario.username);
  if (!mensaje) throw AppError.noEncontrado('Mensaje no encontrado');
  return mensaje;
}

/** Cuenta de no leídos para el badge de la barra superior. */
export async function noLeidos(repositorio, usuario) {
  if (!esEmpleado(usuario)) return 0;
  const alcance = alcanceDe(usuario);
  const mensajes = await repositorio.mensajesDirectos({
    usuario: usuario.username,
    esAdmin: esAdmin(usuario),
    municipios: alcance.municipios ? [...alcance.municipios] : [],
    estados: alcance.estados ? [...alcance.estados] : [],
    limite: 1000
  });
  return mensajes.filter((m) => !m.leido && m.paraUsuario === usuario.username).length;
}
