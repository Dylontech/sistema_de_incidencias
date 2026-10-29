/** Controlador de campañas de promoción y suscripciones (solo administrador). */
import { asyncHandler } from '../utils/AppError.js';
import * as campanas from '../services/campanas.service.js';

export const resumen = asyncHandler(async (req, res) => {
  res.json(await campanas.resumen(req.repositorio, req.usuario));
});

export const listarSuscripciones = asyncHandler(async (req, res) => {
  const suscripciones = await campanas.listarSuscripciones(req.repositorio, req.usuario, {
    estado: req.query.estado || null,
    municipioId: req.query.municipioId || null,
    limite: Number(req.query.limite) || 500
  });
  res.json({ suscripciones });
});

export const listarCampanas = asyncHandler(async (req, res) => {
  const campanasLista = await campanas.listarCampanas(req.repositorio, req.usuario, {
    limite: Number(req.query.limite) || 100
  });
  res.json({ campanas: campanasLista });
});

export const detalleCampana = asyncHandler(async (req, res) => {
  res.json(await campanas.detalleCampana(req.repositorio, req.usuario, req.params.id));
});

export const crearCampana = asyncHandler(async (req, res) => {
  const campana = await campanas.crearCampana(req.repositorio, req.usuario, req.body || {});
  res.status(201).json({ campana });
});

export const actualizarCampana = asyncHandler(async (req, res) => {
  const campana = await campanas.actualizarCampana(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body || {}
  );
  res.json({ campana });
});

export const enviarPrueba = asyncHandler(async (req, res) => {
  const resultado = await campanas.enviarPrueba(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body?.correo
  );
  res.json(resultado);
});

export const enviarCampana = asyncHandler(async (req, res) => {
  const campana = await campanas.enviarCampana(req.repositorio, req.usuario, req.params.id);
  res.json({ campana });
});
