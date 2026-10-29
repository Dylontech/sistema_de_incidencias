/** Controlador de tickets de soporte. */
import { asyncHandler } from '../utils/AppError.js';
import * as tickets from '../services/tickets.service.js';

export const crear = asyncHandler(async (req, res) => {
  res.status(201).json({ ticket: await tickets.crear(req.repositorio, req.usuario, req.body || {}) });
});

export const listar = asyncHandler(async (req, res) => {
  res.json({
    tickets: await tickets.listar(req.repositorio, req.usuario, {
      estado: req.query.estado || null,
      prioridad: req.query.prioridad || null,
      categoria: req.query.categoria || null,
      asignacion: req.query.asignacion || null,
      asignadoA: req.query.asignadoA || null,
      municipioId: req.query.municipio || null,
      texto: req.query.texto || null,
      limite: req.query.limite || 200
    })
  });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ ticket: await tickets.obtener(req.repositorio, req.usuario, req.params.id) });
});

export const responder = asyncHandler(async (req, res) => {
  res.json({
    ticket: await tickets.responder(
      req.repositorio,
      req.usuario,
      req.params.id,
      req.body?.texto,
      { interno: req.body?.interno === true }
    )
  });
});

export const cambiarEstado = asyncHandler(async (req, res) => {
  res.json({
    ticket: await tickets.cambiarEstado(
      req.repositorio,
      req.usuario,
      req.params.id,
      req.body?.estado
    )
  });
});

export const asignar = asyncHandler(async (req, res) => {
  res.json({
    ticket: await tickets.asignar(req.repositorio, req.usuario, req.params.id, req.body || {})
  });
});

export const cambiarPrioridad = asyncHandler(async (req, res) => {
  res.json({
    ticket: await tickets.cambiarPrioridad(
      req.repositorio,
      req.usuario,
      req.params.id,
      req.body?.prioridad
    )
  });
});

export const listarReglas = asyncHandler(async (req, res) => {
  res.json({ reglas: await tickets.listarReglas(req.repositorio, req.usuario) });
});

export const crearRegla = asyncHandler(async (req, res) => {
  res
    .status(201)
    .json({ regla: await tickets.crearRegla(req.repositorio, req.usuario, req.body || {}) });
});

export const eliminarRegla = asyncHandler(async (req, res) => {
  res.json(await tickets.eliminarRegla(req.repositorio, req.usuario, req.params.id));
});
