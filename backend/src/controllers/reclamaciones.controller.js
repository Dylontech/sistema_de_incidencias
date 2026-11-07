/** Controlador de reclamaciones sobre incidencias resueltas. */
import { asyncHandler } from '../utils/AppError.js';
import { registrarAccion } from '../utils/auditoria.js';
import * as reclamaciones from '../services/reclamaciones.service.js';
import { plantillaInforme } from '../services/configuracion.service.js';
import { generarPDFReclamacion } from '../services/pdf-reclamacion.service.js';
import { motorPdf } from '../services/configuracion.service.js';

export const crear = asyncHandler(async (req, res) => {
  const reclamacion = await reclamaciones.crear(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body || {}
  );
  await registrarAccion(req, {
    accion: 'reclamacion_creada',
    entidad: 'reclamaciones',
    entidadId: reclamacion.id,
    detalle: { incidenciaId: reclamacion.incidenciaId, motivo: reclamacion.motivo }
  });
  res.status(201).json({ reclamacion });
});

export const listar = asyncHandler(async (req, res) => {
  res.json({ reclamaciones: await reclamaciones.listar(req.repositorio, req.usuario, req.query || {}) });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({
    reclamacion: await reclamaciones.obtener(req.repositorio, req.usuario, req.params.id)
  });
});

export const delegar = asyncHandler(async (req, res) => {
  const reclamacion = await reclamaciones.delegar(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body || {}
  );
  await registrarAccion(req, {
    accion: 'reclamacion_delegada',
    entidad: 'reclamaciones',
    entidadId: reclamacion.id,
    detalle: { delegadoA: reclamacion.delegadoA }
  });
  res.json({ reclamacion });
});

export const resolver = asyncHandler(async (req, res) => {
  const resultado = await reclamaciones.resolver(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body || {}
  );
  await registrarAccion(req, {
    accion: 'reclamacion_resuelta',
    entidad: 'reclamaciones',
    entidadId: resultado.reclamacion.id,
    detalle: {
      decision: resultado.reclamacion.decision,
      incidenciaId: resultado.reclamacion.incidenciaId
    }
  });
  res.json(resultado);
});

/** Informe preliminar en PDF: lo ve el personal y quien reclamó. */
export const informe = asyncHandler(async (req, res) => {
  const reclamacion = await reclamaciones.obtener(req.repositorio, req.usuario, req.params.id);
  const incidencia = (await req.repositorio.incidenciaPorId(reclamacion.incidenciaId)) || {};
  const plantilla = await plantillaInforme(req.repositorio);
  const motor = await motorPdf(req.repositorio, req.query.pdf);
  const buffer = await generarPDFReclamacion(reclamacion, incidencia, plantilla, {
    motor,
    repositorio: req.repositorio
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="informe-reclamacion-${String(reclamacion.id).slice(0, 8)}.pdf"`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
});
