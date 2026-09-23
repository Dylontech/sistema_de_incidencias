/** Controlador HTTP de usuarios (solo lectura para el panel, sin hashes). */
import { asyncHandler } from '../utils/AppError.js';
import { publico } from '../models/usuario.model.js';

export const listar = asyncHandler(async (req, res) => {
  const usuarios = await req.repositorio.todosLosUsuarios();
  res.json({ usuarios: usuarios.map(publico) });
});
