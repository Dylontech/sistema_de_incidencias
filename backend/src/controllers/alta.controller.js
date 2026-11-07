/** Controlador HTTP de solicitudes de alta de cuentas. */
import { asyncHandler } from '../utils/AppError.js';
import * as altas from '../services/alta-solicitudes.service.js';
import { registrarAccion } from '../utils/auditoria.js';

export const mias = asyncHandler(async (req, res) => {
  res.json({ solicitudes: await altas.mias(req.repositorio, req.usuario) });
});

export const crear = asyncHandler(async (req, res) => {
  const solicitud = await altas.crear(req.repositorio, req.usuario, req.body || {});
  await registrarAccion(req, {
    accion: 'alta_solicitada',
    entidad: 'usuarios',
    entidadId: solicitud.id,
    detalle: {
      solicitudId: solicitud.id,
      username: solicitud.username,
      nombre: solicitud.nombre,
      municipios: solicitud.municipios
    }
  });
  res.status(201).json({ solicitud });
});

export const listar = asyncHandler(async (req, res) => {
  res.json({
    solicitudes: await altas.listar(req.repositorio, req.usuario, {
      estado: req.query.estado,
      limite: req.query.limite
    })
  });
});

/**
 * Aprueba (crea la cuenta y entrega la contraseña temporal al solicitante) o
 * rechaza. La contraseña nunca se guarda en la bitácora.
 */
async function resolver(req, res, aprobar) {
  res.set('Cache-Control', 'no-store');
  const resultado = await altas.resolver(req.repositorio, req.usuario, req.params.id, {
    aprobar,
    respuesta: req.body?.respuesta,
    claveId: req.body?.claveId || null,
    generarClave: req.body?.generarClave === true,
    claveExpiraEn: req.body?.claveExpiraEn || null
  });
  const solicitud = resultado.solicitud || {};
  await registrarAccion(req, {
    accion: aprobar ? 'alta_aprobada' : 'alta_rechazada',
    entidad: 'usuarios',
    entidadId: resultado.usuario?.id || solicitud.id,
    detalle: {
      solicitudId: solicitud.id,
      username: solicitud.username,
      nombre: solicitud.nombre,
      solicitadaPor: solicitud.solicitadoPor,
      respuesta: solicitud.respuesta || '',
      cuentaCreada: Boolean(resultado.usuario)
    }
  });
  res.json(resultado);
}

export const aprobar = asyncHandler((req, res) => resolver(req, res, true));
export const rechazar = asyncHandler((req, res) => resolver(req, res, false));
