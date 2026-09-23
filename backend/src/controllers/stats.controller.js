/** Controlador HTTP de estadísticas, informes y exportación. */
import { asyncHandler } from '../utils/AppError.js';
import * as stats from '../services/stats.service.js';

export const panelAdmin = asyncHandler(async (req, res) => {
  res.json(await stats.panelAdmin(req.repositorio, req.usuario, req.query.municipio || null));
});

export const informes = asyncHandler(async (req, res) => {
  res.json(await stats.informes(req.repositorio, req.usuario, req.query.municipio || null));
});

export const exportacion = asyncHandler(async (req, res) => {
  res.json(await stats.exportacion(req.repositorio, req.usuario, req.query.municipio || null));
});
