/**
 * Adaptadores entre los modelos del sistema y el contrato de `pdf-informes.mjs`.
 *
 * El generador nuevo necesita nombres legibles (tipo, municipio), evidencias como
 * buffer o ruta y fechas normalizadas. Aquí se concentra esa traducción para no
 * contaminar los controladores ni duplicar reglas entre los tres documentos.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from '../../config/index.js';

/** Logo institucional guardado en `/uploads`; cualquier ruta rara se ignora. */
export async function leerLogo(plantilla = {}) {
  const url = String(plantilla.logoUrl || '');
  if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(url)) return null;
  try {
    return await fs.readFile(path.join(config.paths.uploads, path.basename(url)));
  } catch {
    return null;
  }
}

/** Ruta física de una evidencia del reporte (solo archivos servidos desde /uploads). */
export function rutaEvidencia(url) {
  const texto = String(url || '');
  if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(texto)) return undefined;
  return path.join(config.paths.uploads, path.basename(texto));
}

/**
 * Valida un PNG descomprimiendo sus chunks IDAT. PDFKit decodifica el PNG de
 * forma asíncrona: un CRC dañado lanza Z_DATA_ERROR fuera de cualquier
 * try/catch y tumba el proceso. Esta comprobación lo descarta antes.
 */
function pngValido(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return false;
  let offset = 8;
  const datos = [];
  while (offset + 8 <= buffer.length) {
    const longitud = buffer.readUInt32BE(offset);
    const tipo = buffer.toString('ascii', offset + 4, offset + 8);
    const inicio = offset + 8;
    const fin = inicio + longitud;
    if (fin + 4 > buffer.length) return false;
    if (tipo === 'IDAT') datos.push(buffer.subarray(inicio, fin));
    if (tipo === 'IEND') break;
    offset = fin + 4;
  }
  if (!datos.length) return false;
  try {
    zlib.inflateSync(Buffer.concat(datos));
    return true;
  } catch {
    return false;
  }
}

/** Comprueba la firma de un JPEG completo. */
function jpegValido(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length > 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  );
}

let sharpCargado;

/** Carga `sharp` una sola vez; si no está instalado, el PDF sigue funcionando. */
async function cargarSharp() {
  if (sharpCargado === undefined) {
    try {
      sharpCargado = (await import('sharp')).default;
    } catch {
      sharpCargado = null;
    }
  }
  return sharpCargado;
}

/**
 * Corrige la orientación EXIF y reduce el peso de las fotos antes de incrustarlas.
 * Devuelve el buffer original si sharp falta o la imagen no se puede procesar.
 */
export async function optimizarImagen(buffer, mime) {
  if (!buffer?.length) throw new Error('Imagen vacía');
  const tipo = String(mime || '').toLowerCase();
  const esPng = tipo === 'image/png';
  const esJpeg = tipo === 'image/jpeg' || tipo === 'image/jpg';
  if (esPng && !pngValido(buffer)) throw new Error('PNG dañado');
  if (esJpeg && !jpegValido(buffer)) throw new Error('JPEG dañado');

  const sharp = await cargarSharp();
  if (!sharp) {
    // Sin sharp solo se pueden incrustar los formatos que PDFKit entiende.
    if (esPng || esJpeg) return buffer;
    throw new Error('Formato de imagen no soportado');
  }
  try {
    return await sharp(buffer)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    // Con sharp disponible, un fallo de decodificación significa que la imagen
    // está dañada: se omite para que PDFKit no reciba un buffer inválido.
    throw new Error('No se pudo procesar la imagen');
  }
}

/** Objeto de diseño que entiende `disenoDesdeConfiguracion`. */
export function disenoDesdePlantilla(plantilla = {}) {
  return {
    logoPosicion: plantilla.logoPosicion,
    logoAncho: plantilla.logoAncho,
    logoX: plantilla.logoDesplazamientoX,
    logoY: plantilla.logoDesplazamientoY,
    margenSuperior: plantilla.margenSuperior,
    margenDerecho: plantilla.margenDerecho,
    margenInferior: plantilla.margenInferior,
    margenIzquierdo: plantilla.margenIzquierdo,
    pieTexto: plantilla.pieTexto,
    acento: plantilla.colorAcento,
    evidenciaColumnas: plantilla.evidenciaColumnas,
    evidenciaPosicion: plantilla.evidenciaPosicion
  };
}

function aEvidencia(archivo = {}) {
  return {
    nombre: archivo.nombre || archivo.nombreOriginal || 'archivo',
    mime: archivo.tipo || archivo.mime || '',
    tamano: archivo.tamano,
    ruta: archivo.ruta || rutaEvidencia(archivo.url),
    buffer: archivo.buffer
  };
}

/** Responsable de la resolución: el último evento que dejó la incidencia resuelta. */
function responsableResolucion(historial = []) {
  const eventos = [...historial].reverse();
  const evento = eventos.find((h) => String(h.estado || '').toLowerCase() === 'resuelta');
  return evento?.por || eventos.find((h) => /resuelt/i.test(String(h.accion || '')))?.por || '';
}

/**
 * Datos de una incidencia para el PDF rediseñado.
 * `tipo` y `municipio` son los registros del catálogo; si faltan, se usan los ids.
 */
export function datosIncidenciaPdf(incidencia = {}, { tipo = null, municipio = null } = {}) {
  const evidencias = (incidencia.evidencia || []).map(aEvidencia);
  const evidenciasSolucion = (incidencia.documentosResolucion || incidencia.evidenciaSolucion || []).map(aEvidencia);
  const tieneSolucion =
    Boolean(incidencia.fechaResolucion) ||
    Boolean(incidencia.solucion) ||
    (incidencia.costoReparacion !== null && incidencia.costoReparacion !== undefined);

  const municipioPdf = municipio
    ? {
        nombre: municipio.nombre,
        clave: municipio.id || municipio.clave || incidencia.municipioId,
        estado: municipio.estado || incidencia.estadoEntidad || ''
      }
    : incidencia.municipioId;

  return {
    folio: incidencia.folio || incidencia.id,
    titulo: incidencia.titulo,
    tipo: tipo?.nombre || incidencia.tipoNombre || incidencia.tipoId || 'Incidencia',
    estado: incidencia.estado,
    fechaReporte: incidencia.fecha,
    ambito: incidencia.ambito,
    municipio: municipioPdf,
    comunidad: incidencia.zonaNombre || '',
    latitud: incidencia.lat,
    longitud: incidencia.lng,
    reportadoPor: incidencia.esAnonimo ? 'Anónimo' : incidencia.autorNombre || incidencia.autor || 'Anónimo',
    peligrosa: incidencia.peligrosa === true,
    peligrosaMotivo: incidencia.peligrosaMotivo,
    moderacion: incidencia.oculta
      ? {
          oculta: true,
          motivo: incidencia.ocultaMotivo,
          fecha: incidencia.ocultaFecha,
          por: incidencia.ocultaPor
        }
      : null,
    descripcion: incidencia.descripcion,
    indicaciones: incidencia.indicaciones,
    via: {
      nombre: incidencia.viaNombre,
      clave: incidencia.viaClave,
      kilometro: incidencia.kilometro,
      sentido: incidencia.sentido,
      tramo: incidencia.tramo,
      dependencia: incidencia.dependencia
    },
    evidencias,
    solucion: tieneSolucion
      ? {
          fecha: incidencia.fechaResolucion,
          costo: incidencia.costoReparacion,
          texto: incidencia.solucion,
          responsable: responsableResolucion(incidencia.historial),
          evidencias: evidenciasSolucion
        }
      : null,
    historial: (incidencia.historial || []).map((h) => ({
      accion: h.accion,
      fecha: h.fecha,
      actor: h.por,
      estado: h.estado
    }))
  };
}

function alcanceLegible(filtros = {}) {
  if (filtros.municipios?.length) {
    return `${filtros.municipios.length} municipio${filtros.municipios.length === 1 ? '' : 's'}`;
  }
  if (filtros.estados?.length) return `Estados: ${filtros.estados.join(', ')}`;
  return 'Todas las incidencias del ámbito';
}

function tiposLegibles(filtros = {}) {
  if (filtros.tiposTodos) return 'Todos los tipos';
  if (filtros.tipos?.length) {
    return `${filtros.tipos.length} tipo${filtros.tipos.length === 1 ? '' : 's'}`;
  }
  return 'Todos los tipos';
}

function periodoLegible(filtros = {}) {
  if (filtros.desde && filtros.hasta) return `${filtros.desde} a ${filtros.hasta}`;
  if (filtros.desde) return `Desde ${filtros.desde}`;
  if (filtros.hasta) return `Hasta ${filtros.hasta}`;
  return 'Todo el historial';
}

/** Datos del informe general para el PDF rediseñado. */
export function datosInformePdf(datos = {}, { generadoPor = '' } = {}) {
  const filtros = datos.filtros || {};
  const resumen = datos.resumen || {};
  const alcance = alcanceLegible(filtros);
  const tipos = tiposLegibles(filtros);
  const periodo = periodoLegible(filtros);
  return {
    titulo: `Informe de incidencias · ${periodo === 'Todo el historial' ? 'historial completo' : periodo}`,
    filtros: {
      alcance,
      tipos,
      desde: filtros.desde || '',
      hasta: filtros.hasta || '',
      compararPor: filtros.compararPor || 'municipio'
    },
    resumen: {
      total: resumen.total || 0,
      reportadas: resumen.reportadas || 0,
      enProceso: resumen.enProceso || 0,
      resueltas: resumen.resueltas || 0,
      promedioDias: resumen.promedioDias
    },
    porTipo: (datos.porTipo || []).map((tipo) => ({
      etiqueta: tipo.nombre || tipo.etiqueta || '—',
      total: tipo.total || 0
    })),
    porEstado: [
      { clave: 'resuelta', etiqueta: 'Resueltas', total: resumen.resueltas || 0 },
      { clave: 'en_proceso', etiqueta: 'En proceso', total: resumen.enProceso || 0 },
      { clave: 'reportada', etiqueta: 'Reportadas', total: resumen.reportadas || 0 }
    ],
    serie: (datos.series || []).map((fila) => ({ mes: fila.periodo, total: fila.total || 0 })),
    comparativa: (datos.comparativa || []).map((fila) => ({
      ...fila,
      promedioDias: fila.promedioDias
    })),
    incidencias: (datos.detalle || []).map((fila) => ({
      folio: fila.folio || fila.id,
      fecha: fila.fecha,
      tipo: fila.tipo,
      municipio: fila.municipio,
      estado: fila.estado,
      dias: fila.dias
    })),
    generadoPor
  };
}

/** Datos del informe preliminar de reclamación. */
export function datosReclamacionPdf(reclamacion = {}, incidencia = {}, { tipo = null, municipio = null } = {}) {
  const municipioPdf = municipio
    ? {
        nombre: municipio.nombre,
        clave: municipio.id || municipio.clave || incidencia.municipioId,
        estado: municipio.estado || incidencia.estadoEntidad || ''
      }
    : incidencia.municipioId;

  return {
    folio: incidencia.folio || reclamacion.incidenciaFolio || reclamacion.incidenciaId,
    folioReclamacion: reclamacion.folio || reclamacion.id,
    titulo: incidencia.titulo || reclamacion.incidenciaTitulo,
    tipo: tipo?.nombre || incidencia.tipoNombre || incidencia.tipoId,
    estado: incidencia.estado,
    municipio: municipioPdf,
    reclamante: reclamacion.nombre || reclamacion.username || 'Cuenta registrada',
    fechaReclamacion: reclamacion.creadoEn,
    motivo: reclamacion.motivo,
    detalle: reclamacion.detalle,
    decision: reclamacion.decision || 'pendiente',
    resolvio: reclamacion.resueltoPor,
    fechaDecision: reclamacion.resueltoEn,
    delegadoA: reclamacion.delegadoA,
    respuesta: reclamacion.respuesta,
    solucion: incidencia.solucion,
    costo: incidencia.costoReparacion
  };
}
