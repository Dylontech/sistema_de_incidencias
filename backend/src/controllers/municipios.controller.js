/** Controlador HTTP de municipios, zonas y catálogos de presentación. */
import { asyncHandler } from '../utils/AppError.js';
import { ESTADOS_REPUBLICA } from '../config/constantes.js';
import * as municipios from '../services/municipios.service.js';
import * as colindantesService from '../services/colindantes.service.js';
import { estadosPermitidosPara, modoDeAlcance } from '../services/alcance.service.js';

export const listar = asyncHandler(async (req, res) => {
  const incluirPoligono = req.query.poligono === '1' || req.query.poligono === 'true';
  const visibles = await municipios.listar(req.repositorio, req.usuario, { incluirPoligono });
  // `estados` sigue siendo el catálogo nacional (dato público). `alcance` es el
  // territorio que esta sesión puede elegir: un funcionario de Maravatío solo
  // recibe Michoacán, y así los selectores no le ofrecen estados ajenos.
  const estadosAlcance = estadosPermitidosPara(req.usuario, {
    estadoDeMunicipio: new Map(visibles.map((m) => [String(m.id), m.estado]))
  });
  res.json({
    municipios: visibles,
    estados: ESTADOS_REPUBLICA,
    alcance: {
      todos: estadosAlcance === null,
      // `municipios` = alcance municipal: el selector de estadísticas no debe
      // ofrecer estados ni «Añadir un estado».
      modo: modoDeAlcance(req.usuario),
      estados: estadosAlcance === null ? [...ESTADOS_REPUBLICA] : estadosAlcance,
      municipios: visibles.map((m) => m.id)
    }
  });
});

export const detalle = asyncHandler(async (req, res) => {
  res.json({ municipio: await municipios.detalle(req.repositorio, req.usuario, req.params.id) });
});

/** Municipio que contiene un punto: lo usa «mi ubicación». */
export const ubicacion = asyncHandler(async (req, res) => {
  res.json({
    municipio: await municipios.municipioDePunto(req.repositorio, req.usuario, {
      lat: req.query.lat,
      lng: req.query.lng
    })
  });
});

export const zonas = asyncHandler(async (req, res) => {
  res.json({ zonas: await municipios.zonas(req.repositorio, req.usuario, req.params.id) });
});

export const resumenZonas = asyncHandler(async (req, res) => {
  res.json({ zonas: await municipios.resumenZonas(req.repositorio, req.usuario, req.params.id) });
});

/** Conteos por municipio para la pestaña Municipios (solo administradores). */
export const resumenPanel = asyncHandler(async (req, res) => {
  res.json({ municipios: await municipios.resumenPanel(req.repositorio, req.usuario) });
});

/** Municipios que tocan las fronteras del indicado (para saltar de uno a otro). */
export const colindantes = asyncHandler(async (req, res) => {
  // El detalle valida el alcance: nadie enumera los vecinos de un municipio
  // ajeno aprovechando una ruta de solo lectura.
  await municipios.detalle(req.repositorio, req.usuario, req.params.id);
  res.json({ colindantes: await colindantesService.colindantes(req.repositorio, req.params.id) });
});

export const catalogos = asyncHandler(async (req, res) => {
  res.json(await municipios.catalogos(req.repositorio));
});

/** Ficha de información del municipio (personal con alcance). */
export const ficha = asyncHandler(async (req, res) => {
  res.json(await municipios.ficha(req.repositorio, req.usuario, req.params.id));
});

export const guardarFicha = asyncHandler(async (req, res) => {
  res.json(
    await municipios.guardarFicha(req.repositorio, req.usuario, req.params.id, req.body || {})
  );
});

export const aprobarFicha = asyncHandler(async (req, res) => {
  res.json(
    await municipios.resolverFicha(req.repositorio, req.usuario, req.params.id, {
      aprobar: true
    })
  );
});

export const rechazarFicha = asyncHandler(async (req, res) => {
  res.json(
    await municipios.resolverFicha(req.repositorio, req.usuario, req.params.id, {
      aprobar: false,
      motivo: req.body?.motivo || ''
    })
  );
});