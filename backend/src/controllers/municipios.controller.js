/** Controlador HTTP de municipios, zonas y catálogos de presentación. */
import { asyncHandler } from '../utils/AppError.js';
import * as municipios from '../services/municipios.service.js';
import * as colindantesService from '../services/colindantes.service.js';

export const listar = asyncHandler(async (req, res) => {
  const incluirPoligono = req.query.poligono === '1' || req.query.poligono === 'true';
  res.json({ municipios: await municipios.listar(req.repositorio, req.usuario, { incluirPoligono }) });
});

export const detalle = asyncHandler(async (req, res) => {
  res.json({ municipio: await municipios.detalle(req.repositorio, req.usuario, req.params.id) });
});

export const zonas = asyncHandler(async (req, res) => {
  res.json({ zonas: await municipios.zonas(req.repositorio, req.usuario, req.params.id) });
});

export const resumenZonas = asyncHandler(async (req, res) => {
  res.json({ zonas: await municipios.resumenZonas(req.repositorio, req.usuario, req.params.id) });
});

/** Municipios que tocan las fronteras del indicado (para saltar de uno a otro). */
export const colindantes = asyncHandler(async (req, res) => {
  res.json({ colindantes: await colindantesService.colindantes(req.repositorio, req.params.id) });
});

export const catalogos = asyncHandler(async (req, res) => {
  res.json(await municipios.catalogos(req.repositorio));
});