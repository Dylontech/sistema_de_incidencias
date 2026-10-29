/** Controlador de solicitudes de permisos del personal. */
import { asyncHandler } from '../utils/AppError.js';
import * as solicitudes from '../services/permisos-solicitudes.service.js';

export const mias = asyncHandler(async (req, res) => {
  res.json({ solicitudes: await solicitudes.misSolicitudes(req.repositorio, req.usuario) });
});

export const crear = asyncHandler(async (req, res) => {
  res.status(201).json({
    solicitud: await solicitudes.crear(req.repositorio, req.usuario, req.body || {})
  });
});

export const listar = asyncHandler(async (req, res) => {
  res.json({
    solicitudes: await solicitudes.listar(req.repositorio, req.usuario, {
      estado: req.query.estado || null,
      limite: req.query.limite
    })
  });
});

export const aprobar = asyncHandler(async (req, res) => {
  res.json({
    solicitud: await solicitudes.resolver(req.repositorio, req.usuario, req.params.id, {
      aprobar: true,
      respuesta: req.body?.respuesta || ''
    })
  });
});

export const rechazar = asyncHandler(async (req, res) => {
  res.json({
    solicitud: await solicitudes.resolver(req.repositorio, req.usuario, req.params.id, {
      aprobar: false,
      respuesta: req.body?.respuesta || ''
    })
  });
});
