/** Controlador de configuración central. */
import { asyncHandler } from '../utils/AppError.js';
import * as configuracion from '../services/configuracion.service.js';

export const publicas = asyncHandler(async (req, res) => {
  res.json({ configuracion: await configuracion.publicas(req.repositorio) });
});

export const listar = asyncHandler(async (req, res) => {
  res.json({ configuracion: await configuracion.todas(req.repositorio) });
});

export const guardar = asyncHandler(async (req, res) => {
  res.json({ configuracion: await configuracion.guardar(req.repositorio, req.usuario, req.body || {}) });
});
