/** Controlador de claves de acceso multi-municipio. */
import { asyncHandler } from '../utils/AppError.js';
import * as claves from '../services/claves.service.js';
import { cerrarSesion as cerrarEventos } from '../services/eventos.service.js';

/** Cierra el SSE de las sesiones afectadas para que el cliente se entere. */
function cerrarCanales(sesiones = []) {
  for (const sesion of sesiones) {
    if (sesion.userKey && !String(sesion.userKey).startsWith('anon_')) {
      cerrarEventos(sesion.userKey);
    }
  }
}

export const listar = asyncHandler(async (req, res) => {
  res.json({ claves: await claves.listar(req.repositorio, req.usuario) });
});

export const crear = asyncHandler(async (req, res) => {
  const clave = await claves.crear(req.repositorio, req.usuario, req.body || {});
  res.status(201).json({ clave });
});

export const revocar = asyncHandler(async (req, res) => {
  const resultado = await claves.revocar(req.repositorio, req.usuario, req.params.id);
  cerrarCanales(resultado.sesionesCerradas);
  res.json(resultado);
});

export const eliminar = asyncHandler(async (req, res) => {
  const resultado = await claves.eliminar(req.repositorio, req.usuario, req.params.id);
  cerrarCanales(resultado.sesionesCerradas);
  res.json(resultado);
});

export const configurarNotificaciones = asyncHandler(async (req, res) => {
  res.json(
    await claves.configurarNotificaciones(req.repositorio, req.usuario, req.params.id, req.body || {})
  );
});

export const revocarNotificaciones = asyncHandler(async (req, res) => {
  res.json(await claves.revocarNotificaciones(req.repositorio, req.usuario, req.params.id));
});

export const reactivarNotificaciones = asyncHandler(async (req, res) => {
  res.json(await claves.reactivarNotificaciones(req.repositorio, req.usuario, req.params.id));
});
