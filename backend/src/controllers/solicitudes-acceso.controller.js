/** Controlador de solicitudes de acceso. */
import { asyncHandler, AppError } from '../utils/AppError.js';
import * as solicitudes from '../services/solicitudes-acceso.service.js';
import * as correoCuenta from '../services/correo-cuenta.service.js';
import * as adjuntos from '../services/adjuntos.service.js';

export const crear = asyncHandler(async (req, res) => {
  const resultado = await solicitudes.crear(req.repositorio, req.body || {}, { ip: req.ip });
  res.status(201).json(resultado);
});

/** POST /api/publico/correo/estado */
export const estadoCorreo = asyncHandler(async (req, res) => {
  res.json(
    await correoCuenta.estadoCorreo(req.repositorio, {
      correo: req.body?.correo,
      contexto: req.body?.contexto
    })
  );
});

export const subirDocumentos = asyncHandler(async (req, res) => {
  const archivos = req.files || [];
  if (!archivos.length) {
    throw AppError.solicitudInvalida('Selecciona al menos un documento');
  }
  const documentos = [];
  for (const archivo of archivos) {
    documentos.push(
      await adjuntos.guardarAdjunto(req.repositorio, req.usuario, archivo, {
        proposito: 'solicitud_acceso'
      })
    );
  }
  res.status(201).json({ documentos: documentos.map(adjuntos.publico) });
});

export const listar = asyncHandler(async (req, res) => {
  res.json({
    solicitudes: await solicitudes.listar(req.repositorio, {
      estado: req.query.estado === 'todas' ? null : 'pendiente',
      actor: req.usuario
    })
  });
});

export const aprobar = asyncHandler(async (req, res) => {
  res.json(
    await solicitudes.aprobar(
      req.repositorio,
      req.usuario,
      req.params.id,
      req.body || {}
    )
  );
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
