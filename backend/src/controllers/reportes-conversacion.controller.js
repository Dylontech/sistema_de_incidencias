/** Controlador HTTP de reportes de conversación. */
import { asyncHandler } from '../utils/AppError.js';
import * as reportes from '../services/reportes-conversacion.service.js';
import { registrarAccion } from '../utils/auditoria.js';

export const contexto = asyncHandler(async (req, res) => {
  res.json(
    await reportes.contexto(req.repositorio, req.usuario, {
      canal: req.query.canal,
      conversacionId: req.query.conversacionId
    })
  );
});

export const crear = asyncHandler(async (req, res) => {
  const reporte = await reportes.crear(req.repositorio, req.usuario, req.body || {});
  await registrarAccion(req, {
    accion: 'reporte_conversacion_creado',
    entidad: 'reportes_conversacion',
    entidadId: reporte.id,
    detalle: {
      canal: reporte.canal,
      conversacionId: reporte.conversacionId,
      objetivo: reporte.objetivoUsername,
      motivo: reporte.motivo
    }
  });
  res.status(201).json({ reporte });
});

export const listar = asyncHandler(async (req, res) => {
  res.json({
    reportes: await reportes.listar(req.repositorio, req.usuario, {
      estado: req.query.estado,
      limite: req.query.limite
    })
  });
});

export const resolver = asyncHandler(async (req, res) => {
  const reporte = await reportes.resolver(req.repositorio, req.usuario, req.params.id, req.body || {});
  await registrarAccion(req, {
    accion: 'reporte_conversacion_resuelto',
    entidad: 'reportes_conversacion',
    entidadId: reporte.id,
    detalle: {
      accion: reporte.accion,
      objetivo: reporte.objetivoUsername,
      resolucion: reporte.resolucion
    }
  });
  res.json({ reporte });
});

export const revertir = asyncHandler(async (req, res) => {
  const reporte = await reportes.revertir(req.repositorio, req.usuario, req.params.id);
  await registrarAccion(req, {
    accion: 'reporte_conversacion_revertido',
    entidad: 'reportes_conversacion',
    entidadId: reporte.id,
    detalle: { accion: reporte.accion, objetivo: reporte.objetivoUsername }
  });
  res.json({ reporte });
});
