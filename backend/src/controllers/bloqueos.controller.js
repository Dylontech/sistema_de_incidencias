/** Controlador de bloqueos entre cuentas. */
import { asyncHandler } from '../utils/AppError.js';
import * as bloqueos from '../services/bloqueos.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json({ bloqueos: await bloqueos.listar(req.repositorio, req.usuario) });
});

export const bloquear = asyncHandler(async (req, res) => {
  const bloqueo = await bloqueos.bloquear(req.repositorio, req.usuario, req.body || {});
  res.status(201).json({ bloqueo });
});

export const desbloquear = asyncHandler(async (req, res) => {
  res.json(await bloqueos.desbloquear(req.repositorio, req.usuario, req.params.id));
});
