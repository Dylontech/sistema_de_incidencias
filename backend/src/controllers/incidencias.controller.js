/** Controlador HTTP de incidencias. */
import { asyncHandler } from '../utils/AppError.js';
import * as incidencias from '../services/incidencias.service.js';

/** Traduce la query string a los filtros del servicio. */
function filtrosDeQuery(query = {}) {
  return {
    municipioId: query.municipio || null,
    texto: query.texto || '',
    estado: query.estado || 'todos',
    tipoId: query.tipo || 'todos',
    zonaId: query.zona || 'todos',
    color: query.color || 'todos',
    orden: query.orden || 'reciente'
  };
}

export const listar = asyncHandler(async (req, res) => {
  const lista = await incidencias.listar(req.repositorio, req.usuario, filtrosDeQuery(req.query));
  res.json({ incidencias: lista });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ incidencia: await incidencias.obtener(req.repositorio, req.usuario, req.params.id) });
});

export const crear = asyncHandler(async (req, res) => {
  const incidencia = await incidencias.crear(req.repositorio, req.usuario, req.body || {});
  res.status(201).json({ incidencia });
});

export const actualizar = asyncHandler(async (req, res) => {
  const incidencia = await incidencias.actualizar(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body || {}
  );
  res.json({ incidencia });
});

export const cambiarEstado = asyncHandler(async (req, res) => {
  const incidencia = await incidencias.cambiarEstado(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body?.estado
  );
  res.json({ incidencia });
});

export const marcarPeligro = asyncHandler(async (req, res) => {
  const incidencia = await incidencias.marcarPeligro(req.repositorio, req.usuario, req.params.id, {
    peligrosa: req.body?.peligrosa !== false,
    motivo: req.body?.motivo || ''
  });
  res.json({ incidencia });
});

export const resolver = asyncHandler(async (req, res) => {
  const incidencia = await incidencias.resolver(req.repositorio, req.usuario, req.params.id, {
    solucion: req.body?.solucion,
    evidenciaSolucion: req.body?.evidenciaSolucion
  });
  res.json({ incidencia });
});

export const eliminar = asyncHandler(async (req, res) => {
  res.json(await incidencias.eliminar(req.repositorio, req.usuario, req.params.id));
});

export const comentar = asyncHandler(async (req, res) => {
  const incidencia = await incidencias.comentar(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body?.texto
  );
  res.status(201).json({ incidencia });
});
