/**
 * Adjuntos autorizados de chats y comentarios.
 *
 * La subida nunca confía en el MIME declarado: comprueba la firma del archivo,
 * rechaza SVG/formatos macro y sirve los archivos privados por un endpoint con
 * control de participación. Los comentarios solo aceptan imágenes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { config } from '../config/index.js';
import { alcanceDe, esAlgunaAdmin, exigirVisibilidad, puedeVerOculto } from './alcance.service.js';
import { descartar } from './uploads.service.js';

export const ADJUNTOS_POLITICA = {
  chat: {
    mimes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ],
    maxBytes: 10 * 1024 * 1024,
    maxArchivos: 3
  },
  comentario: {
    mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    maxBytes: 5 * 1024 * 1024,
    maxArchivos: 3
  }
};

const EXTENSIONES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx'
};

function extensionPermitida(nombreOriginal = '') {
  const ext = path.extname(String(nombreOriginal)).toLowerCase();
  return Object.values(EXTENSIONES).includes(ext);
}

function firmaValida(buffer, tipo) {
  if (!buffer?.length) return false;
  const hex = buffer.subarray(0, 8).toString('hex');
  if (tipo === 'image/png') return hex.startsWith('89504e47');
  if (tipo === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (tipo === 'image/gif') return buffer.subarray(0, 3).toString() === 'GIF';
  if (tipo === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  if (tipo === 'application/pdf') return buffer.subarray(0, 4).toString() === '%PDF';
  if (tipo.includes('openxmlformats')) return hex.startsWith('504b0304');
  return false;
}

function tieneMacro(buffer) {
  const texto = buffer.toString('latin1');
  return texto.includes('vbaProject.bin') || texto.includes('word/vbaProject');
}

export function sanitizarNombre(nombre = 'archivo') {
  const base = path.basename(String(nombre)).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_');
  return base.slice(0, 180) || 'archivo';
}

export function politica(proposito) {
  return ADJUNTOS_POLITICA[proposito] || ADJUNTOS_POLITICA.chat;
}

export async function guardarAdjunto(repositorio, usuario, archivo, { proposito = 'chat' } = {}) {
  const politicaActual = politica(proposito);
  if (!archivo) throw AppError.solicitudInvalida('Selecciona un archivo');
  if (!politicaActual.mimes.includes(archivo.mimetype)) {
    await descartar(archivo);
    throw AppError.solicitudInvalida('Tipo de archivo no permitido para este chat');
  }
  if (Number(archivo.size) > politicaActual.maxBytes) {
    await descartar(archivo);
    throw AppError.solicitudInvalida(`El archivo supera ${Math.round(politicaActual.maxBytes / 1024 / 1024)} MB`);
  }
  if (!extensionPermitida(archivo.originalname)) {
    await descartar(archivo);
    throw AppError.solicitudInvalida('La extensión del archivo no está permitida');
  }
  const contenido = await fs.readFile(archivo.path);
  if (!firmaValida(contenido, archivo.mimetype)) {
    await descartar(archivo);
    throw AppError.solicitudInvalida('El contenido no corresponde al tipo de archivo');
  }
  if (archivo.mimetype.includes('openxmlformats') && tieneMacro(contenido)) {
    await descartar(archivo);
    throw AppError.solicitudInvalida('Los documentos con macros no están permitidos');
  }
  const hashSha256 = crypto.createHash('sha256').update(contenido).digest('hex');
  const adjunto = {
    id: nuevoId(),
    archivo: path.basename(archivo.filename || archivo.path),
    nombreOriginal: sanitizarNombre(archivo.originalname),
    tipo: archivo.mimetype,
    tamano: Number(archivo.size) || contenido.length,
    hashSha256,
    proposito,
    subidoPorUsuarioId: usuario?.id || null,
    subidoPorUserKey: usuario?.userKey || null,
    contextoTipo: null,
    contextoId: null,
    estado: 'pendiente',
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearAdjunto(adjunto);
  return adjunto;
}

export function publico(adjunto) {
  if (!adjunto) return null;
  return {
    id: adjunto.id,
    nombre: adjunto.nombreOriginal,
    tipo: adjunto.tipo,
    tamano: adjunto.tamano,
    proposito: adjunto.proposito,
    contexto: adjunto.contextoTipo || null,
    url: `/api/adjuntos/${encodeURIComponent(adjunto.id)}`
  };
}

export async function vincularAdjuntos(repositorio, usuario, ids = [], { contextoTipo, contextoId, proposito }) {
  const lista = Array.isArray(ids) ? [...new Set(ids.map(String).filter(Boolean))].slice(0, politica(proposito).maxArchivos) : [];
  for (const id of lista) {
    const adjunto = await repositorio.adjuntoPorId(id);
    if (!adjunto || adjunto.estado !== 'pendiente') {
      throw AppError.solicitudInvalida('Uno de los adjuntos ya no está disponible');
    }
    if (adjunto.subidoPorUsuarioId && adjunto.subidoPorUsuarioId !== usuario?.id) {
      throw AppError.prohibido('No puedes usar un adjunto de otra cuenta');
    }
    if (adjunto.proposito !== proposito) {
      throw AppError.solicitudInvalida('El adjunto no corresponde a este canal');
    }
    await repositorio.vincularAdjunto(id, { contextoTipo, contextoId });
  }
  return lista;
}

export async function adjuntosDe(repositorio, tipo, ids) {
  const lista = await repositorio.adjuntosDeContextos(tipo, ids);
  const mapa = new Map();
  for (const adjunto of lista) {
    if (!mapa.has(adjunto.contextoId)) mapa.set(adjunto.contextoId, []);
    mapa.get(adjunto.contextoId).push(publico(adjunto));
  }
  return mapa;
}

async function participaEnContacto(repositorio, usuario, contacto) {
  if (!contacto) return false;
  if (usuario?.rol === 'admin') return true;
  if (contacto.deUsuarioId === usuario?.id || contacto.deUserKey === usuario?.userKey) return true;
  const destinatarios = await repositorio.contactoFuncionarioDestinatarios(contacto.id);
  if (destinatarios.some((dest) => dest.usuarioId === usuario?.id)) return true;
  if (esAlgunaAdmin(usuario)) {
    const alcance = alcanceDe(usuario);
    if (alcance.todos) return true;
    if (alcance.municipios?.has(contacto.municipioId)) return true;
    if (alcance.estados?.has(contacto.estadoEntidad)) return true;
  }
  return false;
}

export async function autorizarDescarga(repositorio, usuario, adjunto) {
  if (!adjunto) return false;
  if (usuario?.rol === 'admin') return true;
  if (adjunto.subidoPorUsuarioId && adjunto.subidoPorUsuarioId === usuario?.id) return true;
  if (adjunto.contextoTipo === 'mensaje_directo') {
    const mensaje = await repositorio.mensajeDirectoPorId(adjunto.contextoId);
    if (!mensaje) return false;
    return mensaje.deUsuario === usuario?.username || mensaje.paraUsuario === usuario?.username;
  }
  if (adjunto.contextoTipo === 'contacto') {
    const contacto = await repositorio.contactoFuncionarioPorId(adjunto.contextoId);
    return participaEnContacto(repositorio, usuario, contacto);
  }
  if (adjunto.contextoTipo === 'contacto_mensaje') {
    const mensaje = await repositorio.mensajeContactoFuncionarioPorId(adjunto.contextoId);
    if (!mensaje) return false;
    const contacto = await repositorio.contactoFuncionarioPorId(mensaje.contactoId);
    return participaEnContacto(repositorio, usuario, contacto);
  }
  if (adjunto.contextoTipo === 'comentario') {
    const comentario = await repositorio.comentarioIncidenciaPorId(adjunto.contextoId);
    if (!comentario || comentario.oculto || comentario.eliminadoEn) return usuario?.rol === 'admin';
    const incidencia = await repositorio.incidenciaPorId(comentario.incidenciaId);
    if (!incidencia) return false;
    if (incidencia.oculta && !puedeVerOculto(incidencia, usuario)) return false;
    try {
      exigirVisibilidad(incidencia, usuario);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function rutaFisica(adjunto) {
  if (!adjunto?.archivo) return null;
  return path.join(config.paths.uploads, 'adjuntos', path.basename(adjunto.archivo));
}
