/** Controlador del simulador de acciones (solo admin maestro). */
import { asyncHandler } from '../utils/AppError.js';
import * as simulador from '../services/simulacion.service.js';

export const catalogo = asyncHandler(async (req, res) => {
  const base = simulador.catalogo(req.query.rol || null);
  const sesiones = await simulador.listar(req.repositorio, req.usuario);
  res.json({
    ...base,
    sesiones,
    abierta: sesiones.find((s) => s.estado === 'abierta') || null
  });
});

export const listar = asyncHandler(async (req, res) => {
  res.json({ sesiones: await simulador.listar(req.repositorio, req.usuario) });
});

export const abrir = asyncHandler(async (req, res) => {
  res.status(201).json({
    sesion: await simulador.abrir(req.repositorio, req.usuario, req.body || {})
  });
});

export const detalle = asyncHandler(async (req, res) => {
  res.json({ sesion: await simulador.detalle(req.repositorio, req.usuario, req.params.id) });
});

export const ejecutar = asyncHandler(async (req, res) => {
  res.status(201).json(
    await simulador.ejecutar(
      req.repositorio,
      req.usuario,
      req.params.id,
      req.params.accionId,
      req.body || {}
    )
  );
});

export const cerrar = asyncHandler(async (req, res) => {
  res.json({ sesion: await simulador.cerrar(req.repositorio, req.usuario, req.params.id) });
});

export const revertir = asyncHandler(async (req, res) => {
  res.json({ sesion: await simulador.revertir(req.repositorio, req.usuario, req.params.id) });
});

export const revertirTodas = asyncHandler(async (req, res) => {
  res.json(await simulador.revertirTodas(req.repositorio, req.usuario));
});
