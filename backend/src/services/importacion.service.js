/**
 * SERVICIO: Importación de respaldos del monolito.
 *
 * Acepta el JSON que exportaba `Reportes.exportarJSON()`:
 *   { exportado, incidencias, tipos, municipios, usuarios }
 * Convierte la evidencia base64 en archivos reales, descarta `colorAuto`
 * (ya no se persiste) y normaliza los campos que falten.
 */
import { ESTADOS, MUNICIPIO_DEFAULT } from '../config/constantes.js';
import { ahoraIso } from '../utils/fechas.js';
import { nuevoId } from '../utils/ids.js';
import { AppError } from '../utils/AppError.js';
import { guardarDesdeBase64 } from './uploads.service.js';

/** Convierte la evidencia base64 del respaldo en archivos en disco. */
async function convertirEvidencia(lista = []) {
  const salida = [];
  for (const ev of lista) {
    if (!ev) continue;
    if (ev.url) {
      salida.push({
        id: ev.id || nuevoId(),
        nombre: ev.nombre || 'archivo',
        tipo: ev.tipo || 'application/octet-stream',
        tamano: Number(ev.tamano) || 0,
        url: ev.url,
        duracion: ev.duracion === undefined ? null : ev.duracion
      });
      continue;
    }
    if (ev.data) {
      const guardado = await guardarDesdeBase64(ev.data, ev.nombre || 'evidencia');
      if (guardado) {
        salida.push({ ...guardado, duracion: ev.duracion === undefined ? null : ev.duracion });
      }
    }
  }
  return salida;
}

function normalizarIncidencia(bruta, { evidencia, evidenciaSolucion }) {
  const {
    colorAuto,
    tipos,
    municipios,
    usuarios,
    exportado,
    ...resto
  } = bruta;

  return {
    ...resto,
    id: bruta.id || nuevoId(),
    tipoId: bruta.tipoId || 'otro',
    iconoCustom: bruta.iconoCustom || '',
    titulo: bruta.titulo || 'Reporte importado',
    descripcion: bruta.descripcion || '',
    indicaciones: bruta.indicaciones || '',
    lat: Number(bruta.lat) || 0,
    lng: Number(bruta.lng) || 0,
    fecha: bruta.fecha || ahoraIso(),
    actualizado: bruta.actualizado || bruta.fecha || ahoraIso(),
    estado: ESTADOS.includes(bruta.estado) ? bruta.estado : 'reportada',
    esAnonimo: bruta.esAnonimo === true,
    autor: bruta.autor || (bruta.esAnonimo ? 'Anónimo' : 'importado'),
    autorNombre: bruta.autorNombre || bruta.autor || 'Anónimo',
    userKey: bruta.userKey || bruta.autor || 'anon_importado',
    municipioId: bruta.municipioId || MUNICIPIO_DEFAULT,
    zonaId: bruta.zonaId ?? null,
    zonaNombre: bruta.zonaNombre ?? null,
    evidencia,
    historial: Array.isArray(bruta.historial) ? bruta.historial : [],
    comentarios: Array.isArray(bruta.comentarios) ? bruta.comentarios : [],
    fechaResolucion: bruta.fechaResolucion ?? null,
    solucion: bruta.solucion ?? null,
    evidenciaSolucion
  };
}

export async function importarRespaldo(repositorio, datos = {}) {
  if (!datos || typeof datos !== 'object') {
    throw AppError.solicitudInvalida('El respaldo debe ser un objeto JSON');
  }
  const incidenciasBrutas = Array.isArray(datos.incidencias) ? datos.incidencias : [];
  const tiposBrutos = Array.isArray(datos.tipos) ? datos.tipos : [];

  // 1. Tipos personalizados que aún no existan.
  const tiposActuales = await repositorio.todosLosTipos();
  const idsActuales = new Set(tiposActuales.map((t) => t.id));
  let tiposImportados = 0;
  for (const tipo of tiposBrutos) {
    if (!tipo?.id || idsActuales.has(tipo.id) || !tipo.custom) continue;
    await repositorio.crearTipo({
      id: tipo.id,
      nombre: String(tipo.nombre || 'Tipo importado').slice(0, 60),
      icono: tipo.icono || '❗',
      custom: true
    });
    tiposImportados++;
  }

  // 2. Incidencias, convirtiendo su evidencia a archivos.
  const incidencias = [];
  let archivos = 0;
  for (const bruta of incidenciasBrutas) {
    const evidencia = await convertirEvidencia(bruta?.evidencia);
    const evidenciaSolucion = await convertirEvidencia(bruta?.evidenciaSolucion);
    archivos += evidencia.length + evidenciaSolucion.length;
    incidencias.push(normalizarIncidencia(bruta || {}, { evidencia, evidenciaSolucion }));
  }

  const insertadas = await repositorio.insertarIncidencias(incidencias);

  return {
    incidencias: insertadas,
    tipos: tiposImportados,
    archivos,
    omitidas: incidenciasBrutas.length - insertadas
  };
}
