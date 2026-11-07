/** Controlador HTTP de reparaciones de campo. */
import { asyncHandler } from '../utils/AppError.js';
import { registrarAccion } from '../utils/auditoria.js';
import * as reparaciones from '../services/reparaciones.service.js';

export const listar = asyncHandler(async (req, res) => {
  const lista = await reparaciones.listar(req.repositorio, req.usuario, {
    municipioId: req.query.municipio,
    estadoEntidad: req.query.estadoEntidad,
    estados: req.query.estados ? String(req.query.estados).split(',').filter(Boolean) : undefined,
    reparacionEstado: req.query.reparacionEstado || null,
    texto: req.query.texto || '',
    estado: req.query.estado || null,
    tipoId: req.query.tipo || null,
    orden: req.query.orden || 'reciente'
  });
  res.json({ reparaciones: lista });
});

export const cuadrillas = asyncHandler(async (req, res) => {
  const lista = await reparaciones.cuadrillasDisponibles(req.repositorio, req.usuario);
  res.json({ cuadrillas: lista });
});

export const asignar = asyncHandler(async (req, res) => {
  const incidencia = await reparaciones.asignar(req.repositorio, req.usuario, req.params.id, {
    cuadrillaId: req.body?.cuadrillaId,
    notas: req.body?.notas || ''
  });
  await registrarAccion(req, {
    accion: 'reparacion_asignada',
    entidad: 'incidencia',
    entidadId: req.params.id,
    detalle: { cuadrillaId: incidencia.asignadaA, cuadrilla: incidencia.asignadaNombre }
  });
  res.json({ incidencia });
});

export const cambiarEstado = asyncHandler(async (req, res) => {
  const incidencia = await reparaciones.cambiarEstado(req.repositorio, req.usuario, req.params.id, {
    estado: req.body?.estado,
    notas: req.body?.notas || ''
  });
  await registrarAccion(req, {
    accion: `reparacion_${incidencia.reparacionEstado}`,
    entidad: 'incidencia',
    entidadId: req.params.id,
    detalle: { estado: incidencia.reparacionEstado }
  });
  res.json({ incidencia });
});

export const documentos = asyncHandler(async (req, res) => {
  const incidencia = await reparaciones.agregarDocumentos(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body?.documentos || []
  );
  await registrarAccion(req, {
    accion: 'reparacion_documentos',
    entidad: 'incidencia',
    entidadId: req.params.id,
    detalle: { documentos: incidencia.documentosReparacion?.length || 0 }
  });
  res.json({ incidencia });
});
