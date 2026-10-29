/** Controlador de solicitudes de acceso. */
import { asyncHandler } from '../utils/AppError.js';
import * as solicitudes from '../services/solicitudes-acceso.service.js';

export const crear = asyncHandler(async (req, res) => {
  const resultado = await solicitudes.crear(req.repositorio, req.body || {}, { ip: req.ip });
  res.status(201).json(resultado);
});

export const listar = asyncHandler(async (req, res) => {
  res.json({
    solicitudes: await solicitudes.listar(req.repositorio, {
      estado: req.query.estado === 'todas' ? null : 'pendiente'
    })
  });
});

export const aprobar = asyncHandler(async (req, res) => {
  res.json(await solicitudes.aprobar(req.repositorio, req.usuario, req.params.id));
});

export const rechazar = asyncHandler(async (req, res) => {
  res.json({
    solicitud: await solicitudes.rechazar(
      req.repositorio,
      req.usuario,
      req.params.id,
      req.body?.motivo
    )
  });
});
