/**
 * SERVICIO: sugerencias sobre el servicio.
 * El ciudadano recibe un folio para consultar el estado sin exponer su correo.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { normalizarCorreo } from '../models/usuario.model.js';
import {
  alcanceDe,
  esAdminMaestro,
  esAlgunaAdmin
} from './alcance.service.js';
import { enviarRespuestaCiudadano } from './correo.service.js';
import { emitir } from './notificaciones.service.js';

const TIPOS = ['mejora', 'problema', 'contenido', 'otro'];

function folioNuevo() {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `SUG-${fecha}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

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

export async function crear(repositorio, datos = {}, { ipHash = null } = {}) {
  const mensaje = texto(datos.mensaje, 'mensaje', { requerido: true, max: 2000 });
  const correo = datos.correo ? normalizarCorreo(datos.correo) : '';
  if (datos.correo && !correo) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo: 'correo', mensaje: 'Escribe un correo válido o déjalo vacío' }
    ]);
  }
  const tipo = TIPOS.includes(datos.tipo) ? datos.tipo : 'mejora';
  let municipioId = null;
  if (datos.municipioId) {
    const municipio = await repositorio.municipioPorId(String(datos.municipioId));
    if (!municipio) throw AppError.solicitudInvalida('Municipio no encontrado');
    municipioId = municipio.id;
  }

  let folio = folioNuevo();
  while (await repositorio.sugerenciaPorFolio(folio)) folio = folioNuevo();

  const sugerencia = {
    id: nuevoId(),
    folio,
    tipo,
    municipioId,
    nombre: texto(datos.nombre, 'nombre', { max: 120 }) || null,
    correo: correo || null,
    mensaje,
    estado: 'nueva',
    respuesta: '',
    respondidoPor: null,
    respondidoEn: null,
    ipHash,
    creadoEn: new Date().toISOString()
  };

  await repositorio.crearSugerencia(sugerencia);

  // Aviso interno al administrador: antes la sugerencia solo existía en la bandeja.
  await emitir(repositorio, {
    evento: 'sugerencia_creada',
    titulo: '💡 Nueva sugerencia ciudadana',
    mensaje: `${sugerencia.folio}: ${sugerencia.mensaje.slice(0, 140)}`,
    severidad: 'info',
    entidadTipo: 'sugerencia',
    entidadId: sugerencia.id,
    municipioId: sugerencia.municipioId,
    url: '/?bandeja=sugerencias',
    claveDedupe: `sugerencia_creada:${sugerencia.id}`
  });

  return {
    folio,
    mensaje: 'Gracias por tu sugerencia. Guarda el folio para consultar su estado.'
  };
}

export async function consultar(repositorio, folio, correo = '') {
  const sugerencia = await repositorio.sugerenciaPorFolio(folio);
  if (!sugerencia) throw AppError.noEncontrado('No encontramos esa sugerencia');

  // Si la persona dejó correo, se exige para consultar (evita que cualquiera
  // lea respuestas ajenas con solo probar folios).
  if (sugerencia.correo) {
    const email = normalizarCorreo(correo);
    if (!email || email !== sugerencia.correo) {
      throw AppError.noEncontrado('No encontramos esa sugerencia');
    }
  }

  return {
    folio: sugerencia.folio,
    tipo: sugerencia.tipo,
    estado: sugerencia.estado,
    mensaje: sugerencia.mensaje,
    respuesta: sugerencia.respuesta,
    creadoEn: sugerencia.creadoEn,
    respondidoEn: sugerencia.respondidoEn
  };
}

/** Municipios donde el actor puede ver y responder sugerencias (`null` = todos). */
async function municipiosDelAlcance(repositorio, usuario) {
  if (esAdminMaestro(usuario)) return null;
  const alcance = alcanceDe(usuario);
  if (alcance.todos) return null;
  if (alcance.municipios) return [...alcance.municipios];
  if (alcance.estados) {
    const catalogo = await repositorio.todosMunicipios();
    return catalogo.filter((m) => alcance.estados.has(m.estado)).map((m) => m.id);
  }
  return [];
}

export async function listar(repositorio, usuario, filtros = {}) {
  if (!esAlgunaAdmin(usuario)) {
    throw AppError.prohibido('Las sugerencias solo las revisa un administrador');
  }

  const municipios = await municipiosDelAlcance(repositorio, usuario);

  return repositorio.sugerencias({
    estado: filtros.estado || null,
    municipios:
      filtros.municipio && municipios === null
        ? [filtros.municipio]
        : filtros.municipio && municipios
          ? municipios.filter((id) => id === filtros.municipio)
          : municipios,
    limite: filtros.limite || 200
  });
}

export async function responder(repositorio, usuario, id, respuesta) {
  if (!esAlgunaAdmin(usuario)) {
    throw AppError.prohibido('Solo un administrador puede responder sugerencias');
  }
  const sugerencia = (await repositorio.sugerencias({ limite: 500 })).find((s) => s.id === id);
  if (!sugerencia) throw AppError.noEncontrado('Sugerencia no encontrada');

  if (!esAdminMaestro(usuario)) {
    const permitidos = await municipiosDelAlcance(repositorio, usuario);
    if (permitidos !== null && !permitidos.includes(sugerencia.municipioId)) {
      throw AppError.prohibido('Esa sugerencia está fuera de tu ámbito');
    }
  }

  const limpio = texto(respuesta, 'respuesta', { requerido: true, max: 2000 });
  const actualizada = await repositorio.actualizarSugerencia(id, {
    estado: 'atendida',
    respuesta: limpio,
    respondidoPor: usuario.username,
    respondidoEn: new Date().toISOString()
  });

  if (sugerencia.correo) {
    await enviarRespuestaCiudadano(repositorio, {
      para: sugerencia.correo,
      asunto: `Respuesta a tu sugerencia ${sugerencia.folio}`,
      titulo: 'Respuesta a tu sugerencia',
      mensaje: limpio
    });
  }

  return actualizada;
}
