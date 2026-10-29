/** Controlador HTTP de los formularios públicos. */
import { asyncHandler } from '../utils/AppError.js';
import * as solicitudes from '../services/solicitudes.service.js';
import * as contacto from '../services/contacto.service.js';
import * as sugerencias from '../services/sugerencias.service.js';
import * as campanas from '../services/campanas.service.js';

/** POST /api/publico/suscripciones */
export const crearSuscripcion = asyncHandler(async (req, res) => {
  const resultado = await campanas.suscribir(req.repositorio, req.body || {}, {
    ipHash: null
  });
  res.status(201).json(resultado);
});

/** POST /api/publico/suscripciones/confirmar */
export const confirmarSuscripcion = asyncHandler(async (req, res) => {
  res.json(await campanas.confirmar(req.repositorio, req.body?.token));
});

/** POST /api/publico/suscripciones/baja */
export const bajaSuscripcion = asyncHandler(async (req, res) => {
  res.json(await campanas.darDeBaja(req.repositorio, req.body?.token));
});

/** POST /api/publico/contacto */
export const crearContacto = asyncHandler(async (req, res) => {
  const resultado = await contacto.crear(req.repositorio, req.body || {}, {
    ipHash: null
  });
  res.status(201).json(resultado);
});

/** POST /api/publico/sugerencias */
export const crearSugerencia = asyncHandler(async (req, res) => {
  const resultado = await sugerencias.crear(req.repositorio, req.body || {}, {
    ipHash: null
  });
  res.status(201).json(resultado);
});

/** GET /api/publico/sugerencias/:folio */
export const consultarSugerencia = asyncHandler(async (req, res) => {
  res.json(await sugerencias.consultar(req.repositorio, req.params.folio, req.query.correo));
});

/** Catálogo mínimo de municipios (sin polígonos ni claves de acceso). */
export const municipios = asyncHandler(async (req, res) => {
  const lista = await req.repositorio.todosMunicipios();
  res.json({
    municipios: lista.map((m) => ({ id: m.id, nombre: m.nombre, estado: m.estado }))
  });
});

/** Catálogo mínimo de tipos para filtrar el informe. */
export const tipos = asyncHandler(async (req, res) => {
  const lista = await req.repositorio.todosLosTipos();
  res.json({ tipos: lista.map((t) => ({ id: t.id, nombre: t.nombre, icono: t.icono })) });
});

/** POST /api/publico/solicitudes-informe */
export const crearSolicitudInforme = asyncHandler(async (req, res) => {
  const resultado = await solicitudes.crearSolicitud(req.repositorio, req.body || {}, {
    ip: req.ip,
    userAgent: req.headers['user-agent'] || ''
  });
  res.status(201).json(resultado);
});

/** GET /api/publico/solicitudes-informe/verificar/:token */
export const verificarSolicitud = asyncHandler(async (req, res) => {
  const resultado = await solicitudes.verificarSolicitud(req.repositorio, req.params.token);
  res.json(resultado);
});

/** GET /api/publico/solicitudes-informe/:folio?correo=... */
export const consultarSolicitud = asyncHandler(async (req, res) => {
  const resultado = await solicitudes.consultarSolicitud(
    req.repositorio,
    req.params.folio,
    req.query.correo
  );
  res.json(resultado);
});
