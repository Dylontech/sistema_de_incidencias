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

/* V2.11 — roles integrados editables y roles propios */

export const listarRoles = asyncHandler(async (req, res) => {
  const incluirInactivos = req.query.inactivos === '1';
  res.json({ roles: await roles.listarRoles(req.repositorio, { incluirInactivos }) });
});

export const catalogoRoles = asyncHandler(async (req, res) => {
  res.json(await roles.catalogoAsignable(req.repositorio));
});

export const crearRol = asyncHandler(async (req, res) => {
  res.status(201).json({
    rol: await roles.crearRol(req.repositorio, req.usuario, req.body || {})
  });
});

export const actualizarRol = asyncHandler(async (req, res) => {
  res.json({
    rol: await roles.actualizarRol(req.repositorio, req.usuario, req.params.id, req.body || {})
  });
});

export const restablecerRol = asyncHandler(async (req, res) => {
  res.json({
    rol: await roles.restablecerRol(req.repositorio, req.usuario, req.params.id)
  });
});

export const eliminarRol = asyncHandler(async (req, res) => {
  res.json(await roles.eliminarRol(req.repositorio, req.usuario, req.params.id));
});
