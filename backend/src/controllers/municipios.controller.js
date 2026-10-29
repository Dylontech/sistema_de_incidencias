/** Controlador HTTP de municipios, zonas y catálogos de presentación. */
import { asyncHandler } from '../utils/AppError.js';
import { ESTADOS_REPUBLICA } from '../config/constantes.js';
import * as municipios from '../services/municipios.service.js';
import * as colindantesService from '../services/colindantes.service.js';

export const listar = asyncHandler(async (req, res) => {
  const incluirPoligono = req.query.poligono === '1' || req.query.poligono === 'true';
  res.json({
    municipios: await municipios.listar(req.repositorio, req.usuario, { incluirPoligono }),
    estados: ESTADOS_REPUBLICA
  });
});

export const detalle = asyncHandler(async (req, res) => {
  res.json({ municipio: await municipios.detalle(req.repositorio, req.usuario, req.params.id) });
});

/** Municipio que contiene un punto: lo usa «mi ubicación». */
export const ubicacion = asyncHandler(async (req, res) => {
  res.json({
    municipio: await municipios.municipioDePunto(req.repositorio, req.usuario, {
      lat: req.query.lat,
      lng: req.query.lng
    })
  });
});

export const zonas = asyncHandler(async (req, res) => {
  res.json({ zonas: await municipios.zonas(req.repositorio, req.usuario, req.params.id) });
});

export const resumenZonas = asyncHandler(async (req, res) => {
  res.json({ zonas: await municipios.resumenZonas(req.repositorio, req.usuario, req.params.id) });
});

/** Conteos por municipio para la pestaña Municipios (solo administradores). */
export const resumenPanel = asyncHandler(async (req, res) => {
  res.json({ municipios: await municipios.resumenPanel(req.repositorio, req.usuario) });
});

/** Municipios que tocan las fronteras del indicado (para saltar de uno a otro). */
export const colindantes = asyncHandler(async (req, res) => {
  res.json({ colindantes: await colindantesService.colindantes(req.repositorio, req.params.id) });
});

export const catalogos = asyncHandler(async (req, res) => {
  res.json(await municipios.catalogos(req.repositorio));
});

/** Ficha de información del municipio (personal con alcance). */
export const ficha = asyncHandler(async (req, res) => {
  res.json(await municipios.ficha(req.repositorio, req.usuario, req.params.id));
});

export const guardarFicha = asyncHandler(async (req, res) => {
  res.json(
    await municipios.guardarFicha(req.repositorio, req.usuario, req.params.id, req.body || {})
  );
});

export const aprobarFicha = asyncHandler(async (req, res) => {
  res.json(
    await municipios.resolverFicha(req.repositorio, req.usuario, req.params.id, {
      aprobar: true
    })
  );
});

export const rechazarFicha = asyncHandler(async (req, res) => {
  res.json(
    await municipios.resolverFicha(req.repositorio, req.usuario, req.params.id, {
      aprobar: false,
      motivo: req.body?.motivo || ''
    })
  );
});