/** Controlador HTTP del catálogo de tipos de incidencia. */
import { asyncHandler } from '../utils/AppError.js';
import * as tipos from '../services/tipos.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json({ tipos: await tipos.listar(req.repositorio) });
});

export const crear = asyncHandler(async (req, res) => {
  const tipo = await tipos.crear(req.repositorio, req.usuario, req.body || {});
  res.status(201).json({ tipo });
});

export const eliminar = asyncHandler(async (req, res) => {
  res.json(await tipos.eliminar(req.repositorio, req.usuario, req.params.id));
});
