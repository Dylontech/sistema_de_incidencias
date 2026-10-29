/** Controlador de respaldos y restauración. */
import { asyncHandler } from '../utils/AppError.js';
import * as respaldos from '../services/respaldos.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json(
    await respaldos.listar(req.repositorio, {
      texto: req.query.texto || '',
      tipo: req.query.tipo || null,
      estado: req.query.estado || null,
      desde: req.query.desde || null,
      hasta: req.query.hasta || null,
      pagina: req.query.pagina,
      limite: req.query.limite
    })
  );
});

export const crear = asyncHandler(async (req, res) => {
  res.status(201).json({
    respaldo: await respaldos.crear(req.repositorio, req.usuario, req.body || {})
  });
});

export const detalle = asyncHandler(async (req, res) => {
  res.json({ respaldo: await respaldos.detalle(req.repositorio, req.params.id) });
});

export const descargar = asyncHandler(async (req, res) => {
  const { respaldo, ruta } = await respaldos.rutaDescarga(req.repositorio, req.usuario, req.params.id);
  res.download(ruta, respaldo.archivo);
});

export const restaurar = asyncHandler(async (req, res) => {
  res.json({
    respaldo: await respaldos.restaurar(req.repositorio, req.usuario, req.params.id, req.body || {})
  });
});

export const eliminar = asyncHandler(async (req, res) => {
  res.json(await respaldos.eliminar(req.repositorio, req.usuario, req.params.id));
});

export const estadisticas = asyncHandler(async (req, res) => {
  res.json({ estadisticas: await respaldos.estadisticas(req.repositorio) });
});
