/** Controlador de roles especiales. */
import { asyncHandler } from '../utils/AppError.js';
import * as roles from '../services/roles.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json({ roles: await roles.listar(req.repositorio) });
});

export const catalogo = asyncHandler(async (req, res) => {
  res.json(await roles.catalogo(req.repositorio));
});

export const crear = asyncHandler(async (req, res) => {
  res.status(201).json({ rol: await roles.crear(req.repositorio, req.usuario, req.body || {}) });
});

export const actualizar = asyncHandler(async (req, res) => {
  res.json({
    rol: await roles.actualizar(req.repositorio, req.usuario, req.params.id, req.body || {})
  });
});

export const eliminar = asyncHandler(async (req, res) => {
  res.json(await roles.eliminar(req.repositorio, req.usuario, req.params.id));
});
