/** Controlador de sesiones conectadas (monitoreo y revocación). */
import { asyncHandler, AppError } from '../utils/AppError.js';
import { cerrarSesion as cerrarEventos } from '../services/eventos.service.js';

export const listar = asyncHandler(async (req, res) => {
  const sesiones = await req.repositorio.listarSesiones({ limite: req.query.limite });
  res.json({ sesiones });
});

export const revocar = asyncHandler(async (req, res) => {
  const sesion = await req.repositorio.sesionPorId(req.params.id);
  if (!sesion) throw AppError.noEncontrado('Sesión no encontrada');
  await req.repositorio.cerrarSesion(sesion.id, 'revocada por administrador');
  if (sesion.userKey) cerrarEventos(sesion.userKey);
  res.json({ mensaje: 'Sesión revocada' });
});
