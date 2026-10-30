/** Controlador HTTP de solicitudes de baja de cuentas. */
import { asyncHandler } from '../utils/AppError.js';
import * as bajas from '../services/baja-solicitudes.service.js';
import { registrarAccion } from '../utils/auditoria.js';

export const mias = asyncHandler(async (req, res) => {
  res.json({ solicitudes: await bajas.mias(req.repositorio, req.usuario) });
});

export const crear = asyncHandler(async (req, res) => {
  const solicitud = await bajas.crear(req.repositorio, req.usuario, req.body || {});
  // La acción explícita queda en la bitácora además del POST automático.
  await registrarAccion(req, {
    accion: 'baja_solicitada',
    entidad: 'usuarios',
    entidadId: solicitud.usuarioId,
    detalle: { solicitudId: solicitud.id, motivo: solicitud.motivo }
  });
  res.status(201).json({ solicitud });
});

export const listar = asyncHandler(async (req, res) => {
  res.json({
    solicitudes: await bajas.listar(req.repositorio, req.usuario, {
      estado: req.query.estado,
      limite: req.query.limite
    })
  });
});

/** Aplica o rechaza la baja y deja el resultado en auditoría. */
async function resolver(req, res, aprobar) {
  const solicitud = await bajas.resolver(req.repositorio, req.usuario, req.params.id, {
    aprobar,
    respuesta: req.body?.respuesta
  });
  await registrarAccion(req, {
    accion: aprobar ? 'baja_aprobada' : 'baja_rechazada',
    entidad: 'usuarios',
    entidadId: solicitud.usuarioId,
    detalle: {
      solicitudId: solicitud.id,
      cuenta: solicitud.username,
      motivo: solicitud.motivo,
      respuesta: solicitud.respuesta || '',
      desactivada: aprobar
    }
  });
  res.json(solicitud);
}

export const aprobar = asyncHandler((req, res) => resolver(req, res, true));
export const rechazar = asyncHandler((req, res) => resolver(req, res, false));
