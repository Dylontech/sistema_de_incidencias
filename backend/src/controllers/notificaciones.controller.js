/** Controlador HTTP de notificaciones. */
import { asyncHandler } from '../utils/AppError.js';
import * as notificaciones from '../services/notificaciones.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json({ notificaciones: await notificaciones.listar(req.repositorio, req.usuario) });
});

export const marcarLeida = asyncHandler(async (req, res) => {
  const lista = await notificaciones.marcarLeida(req.repositorio, req.usuario, req.params.id);
  res.json({ notificaciones: lista });
});

export const marcarTodas = asyncHandler(async (req, res) => {
  const resultado = await notificaciones.marcarTodasLeidas(req.repositorio, req.usuario);
  res.json(resultado);
});

export const eliminar = asyncHandler(async (req, res) => {
  const lista = await notificaciones.eliminar(req.repositorio, req.usuario, req.params.id);
  res.json({ notificaciones: lista });
});
