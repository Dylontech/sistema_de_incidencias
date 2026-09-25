/**
 * Controlador HTTP de usuarios.
 *
 * `GET /usuarios` sirve al panel (funcionario y admin): solo devuelve cuentas
 * del personal y sin hashes. El alta y la edición son exclusivas del
 * administrador (`requiereAdmin` en las rutas).
 */
import { asyncHandler } from '../utils/AppError.js';
import * as usuarios from '../services/usuarios.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json({ usuarios: await usuarios.listar(req.repositorio) });
});

export const crear = asyncHandler(async (req, res) => {
  const usuario = await usuarios.crear(req.repositorio, req.body || {});
  res.status(201).json({ usuario });
});

export const actualizar = asyncHandler(async (req, res) => {
  const usuario = await usuarios.actualizar(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body || {}
  );
  res.json({ usuario });
});
