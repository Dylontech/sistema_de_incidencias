/** Controlador HTTP del catálogo administrativo de vialidades. */
import { asyncHandler } from '../utils/AppError.js';
import * as vialidades from '../services/vialidades.service.js';

function filtrosDeQuery(query = {}) {
  return {
    municipioId: query.municipio || query.municipioId || null,
    tipo: query.tipo || null,
    fuente: query.fuente || null,
    texto: query.texto || '',
    soloDesactualizadas: query.desactualizadas === '1' || query.desactualizadas === 'true',
    soloSinVerificar: query.sinVerificar === '1' || query.sinVerificar === 'true'
  };
}

export const listar = asyncHandler(async (req, res) => {
  res.json(await vialidades.listarAdmin(req.repositorio, req.usuario, filtrosDeQuery(req.query)));
});

export const crear = asyncHandler(async (req, res) => {
  res.status(201).json({
    vialidad: await vialidades.crearAdmin(req.repositorio, req.usuario, req.body || {})
  });
});

export const actualizar = asyncHandler(async (req, res) => {
  res.json({
    vialidad: await vialidades.actualizarAdmin(
      req.repositorio,
      req.usuario,
      req.params.id,
      req.body || {}
    )
  });
});

export const verificar = asyncHandler(async (req, res) => {
  res.json({
    vialidad: await vialidades.verificarAdmin(req.repositorio, req.usuario, req.params.id)
  });
});

export const eliminar = asyncHandler(async (req, res) => {
  res.json(await vialidades.eliminarAdmin(req.repositorio, req.usuario, req.params.id));
});

export const importar = asyncHandler(async (req, res) => {
  res.status(201).json(
    await vialidades.importarAdmin(req.repositorio, req.usuario, req.body || {})
  );
});

export const importarOsm = asyncHandler(async (req, res) => {
  res.status(201).json(
    await vialidades.importarOsmAdmin(req.repositorio, req.usuario, req.body || {})
  );
});
