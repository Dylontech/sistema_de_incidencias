/** Controlador de claves de acceso multi-municipio. */
import { asyncHandler } from '../utils/AppError.js';
import * as claves from '../services/claves.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json({ claves: await claves.listar(req.repositorio, req.usuario) });
});

export const crear = asyncHandler(async (req, res) => {
  const clave = await claves.crear(req.repositorio, req.usuario, req.body || {});
  res.status(201).json({ clave });
});

export const revocar = asyncHandler(async (req, res) => {
  res.json({ clave: await claves.revocar(req.repositorio, req.usuario, req.params.id) });
});
