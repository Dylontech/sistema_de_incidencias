/** Controlador HTTP de solicitudes de cambio de contraseña. */
import { asyncHandler } from '../utils/AppError.js';
import * as password from '../services/password-solicitudes.service.js';
import { registrarAccion } from '../utils/auditoria.js';

export const mias = asyncHandler(async (req, res) => {
  res.json({ solicitudes: await password.misSolicitudes(req.repositorio, req.usuario) });
});

export const crear = asyncHandler(async (req, res) => {
  const solicitud = await password.crear(req.repositorio, req.usuario, req.body || {});
  await registrarAccion(req, {
    accion: 'solicitud_password_creada',
    entidad: 'usuarios',
    entidadId: solicitud.usuarioId,
    detalle: {
      solicitudId: solicitud.id,
      titular: solicitud.username,
      motivo: solicitud.motivo,
      paraOtraCuenta: solicitud.usuarioId !== req.usuario?.id
    }
  });
  res.status(201).json({ solicitud });
});

export const listar = asyncHandler(async (req, res) => {
  res.json({
    solicitudes: await password.listar(req.repositorio, req.usuario, {
      estado: req.query.estado,
      limite: req.query.limite
    })
  });
});

/**
 * Aprueba (genera la temporal y la entrega al solicitante) o rechaza. La
 * contraseña nunca se escribe en auditoría: solo se deja constancia de que se
 * generó y para qué cuenta.
 */
async function resolver(req, res, aprobar) {
  // La contraseña temporal también se devuelve aquí, una única vez, para que
  // el panel la muestre al administrador que resolvió.
  res.set('Cache-Control', 'no-store');
  const resultado = await password.resolver(req.repositorio, req.usuario, req.params.id, {
    aprobar,
    respuesta: req.body?.respuesta
  });
  const solicitud = resultado.solicitud || {};
  await registrarAccion(req, {
    accion: aprobar ? 'solicitud_password_aprobada' : 'solicitud_password_rechazada',
    entidad: 'usuarios',
    entidadId: solicitud.usuarioId,
    detalle: {
      solicitudId: solicitud.id,
      titular: solicitud.username,
      solicitadaPor: solicitud.solicitadoPor || solicitud.username,
      respuesta: solicitud.respuesta || '',
      passwordGenerada: Boolean(resultado.generada)
    }
  });
  res.json(resultado);
}

export const aprobar = asyncHandler((req, res) => resolver(req, res, true));
export const rechazar = asyncHandler((req, res) => resolver(req, res, false));
