/** Controlador HTTP de municipios, zonas y catálogos de presentación. */
import { asyncHandler } from '../utils/AppError.js';
import * as municipios from '../services/municipios.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json({ municipios: await municipios.listar(req.repositorio, req.usuario) });
});

export const zonas = asyncHandler(async (req, res) => {
  res.json({ zonas: await municipios.zonas(req.repositorio, req.usuario, req.params.id) });
});

export const resumenZonas = asyncHandler(async (req, res) => {
  res.json({ zonas: await municipios.resumenZonas(req.repositorio, req.usuario, req.params.id) });
});

export const catalogos = asyncHandler(async (req, res) => {
  res.json(await municipios.catalogos(req.repositorio));
});
