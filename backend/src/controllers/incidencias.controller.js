/** Controlador HTTP de incidencias. */
import { asyncHandler } from '../utils/AppError.js';
import * as incidencias from '../services/incidencias.service.js';
import * as vialidades from '../services/vialidades.service.js';
import * as archivo from '../services/archivo.service.js';
import { generarPDFIncidencia } from '../services/pdf-incidencia.service.js';
import { motorPdf, plantillaInforme } from '../services/configuracion.service.js';

/** Traduce la query string a los filtros del servicio. */
function filtrosDeQuery(query = {}) {
  return {
    municipioId: query.municipio || null,
    estadoEntidad: query.estadoEntidad || null,
    texto: query.texto || '',
    estado: query.estado || 'todos',
    tipoId: query.tipo || 'todos',
    zonaId: query.zona || 'todos',
    ambito: query.ambito || 'todos',
    desde: query.desde || null,
    hasta: query.hasta || null,
    color: query.color || 'todos',
    orden: query.orden || 'reciente',
    archivo: query.archivo === '1' || query.archivo === 'true'
  };
}

export const listar = asyncHandler(async (req, res) => {
  const lista = await incidencias.listar(req.repositorio, req.usuario, filtrosDeQuery(req.query));
  res.json({ incidencias: lista });
});

/** PDF de una incidencia con su historial, solución y documentos. */
export const pdf = asyncHandler(async (req, res) => {
  const incidencia = await incidencias.obtener(req.repositorio, req.usuario, req.params.id);
  const plantilla = await plantillaInforme(req.repositorio);
  const motor = await motorPdf(req.repositorio, req.query.pdf);
  const buffer = await generarPDFIncidencia(incidencia, plantilla, {
    motor,
    repositorio: req.repositorio
  });
  const folio = String(incidencia.folio || incidencia.id || 'incidencia').replace(/[^\w-]/g, '');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="incidencia-${folio}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
});

/** Puntos ligeros para el mapa (sin evidencias ni comentarios). */
export const mapa = asyncHandler(async (req, res) => {
  const datos = await incidencias.mapa(req.repositorio, req.usuario, {
    ...filtrosDeQuery(req.query),
    bbox: req.query.bbox || null,
    cluster: req.query.cluster === '1' || req.query.cluster === 'true',
    celdas: Number(req.query.celdas) || 48,
    limite: Number(req.query.limite) || 3000
  });
  res.json(datos);
});

  /** Condición de vialidades para la capa del mapa. */
export const vialidadesMapa = asyncHandler(async (req, res) => {
  vialidades.exigirAcceso(req.usuario);
  const datos = await vialidades.condicionVialidades(req.repositorio, req.usuario, {
    ...filtrosDeQuery(req.query),
    bbox: req.query.bbox || null
  });
  res.json(datos);
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ incidencia: await incidencias.obtener(req.repositorio, req.usuario, req.params.id) });
});

/** Archivo general agrupado por mes y día. */
export const archivoGeneral = asyncHandler(async (req, res) => {
  const datos = await archivo.archivo(req.repositorio, req.usuario, filtrosDeQuery(req.query));
  res.json(datos);
});

/** Expediente completo de una incidencia resuelta. */
export const expediente = asyncHandler(async (req, res) => {
  const datos = await archivo.expediente(req.repositorio, req.usuario, req.params.id);
  res.json(datos);
});

export const crear = asyncHandler(async (req, res) => {
  const incidencia = await incidencias.crear(req.repositorio, req.usuario, req.body || {});
  res.status(201).json({ incidencia });
});

export const actualizar = asyncHandler(async (req, res) => {
  const incidencia = await incidencias.actualizar(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body || {}
  );
  res.json({ incidencia });
});

export const cambiarEstado = asyncHandler(async (req, res) => {
  const incidencia = await incidencias.cambiarEstado(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body?.estado
  );
  res.json({ incidencia });
});

export const marcarPeligro = asyncHandler(async (req, res) => {
  const incidencia = await incidencias.marcarPeligro(req.repositorio, req.usuario, req.params.id, {
    peligrosa: req.body?.peligrosa !== false,
    motivo: req.body?.motivo || ''
  });
  res.json({ incidencia });
});

export const resolver = asyncHandler(async (req, res) => {
  const incidencia = await incidencias.resolver(req.repositorio, req.usuario, req.params.id, {
    solucion: req.body?.solucion,
    evidenciaSolucion: req.body?.evidenciaSolucion,
    costoReparacion: req.body?.costoReparacion,
    desgloseCostos: req.body?.desgloseCostos
  });
  res.json({ incidencia });
});

export const eliminar = asyncHandler(async (req, res) => {
  res.json(await incidencias.eliminar(req.repositorio, req.usuario, req.params.id));
});
