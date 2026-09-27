/** Controlador HTTP de moderación: denuncias, ocultamiento y sanciones. */
import { asyncHandler } from '../utils/AppError.js';
import * as moderacion from '../services/moderacion.service.js';

/* --------------------------------------------------------------- denuncias */

/** Denunciar un reporte (o un comentario suyo). Cualquier sesión. */
export const denunciar = asyncHandler(async (req, res) => {
  const denuncia = await moderacion.denunciar(req.repositorio, req.usuario, req.params.id, req.body || {});
  res.status(201).json({ denuncia });
});

/** Cola de moderación: denuncias agrupadas por contenido. */
export const listarDenuncias = asyncHandler(async (req, res) => {
  const resultado = await moderacion.listarDenuncias(req.repositorio, req.usuario, {
    estado: req.query.estado || 'pendiente',
    municipioId: req.query.municipio || null
  });
  res.json(resultado);
});

/** Contadores del panel de moderación. */
export const resumen = asyncHandler(async (req, res) => {
  res.json({
    resumen: await moderacion.resumen(req.repositorio, req.usuario, req.query.municipio || null)
  });
});

/** Cierra una denuncia aplicando la decisión del moderador. */
export const resolver = asyncHandler(async (req, res) => {
  res.json(
    await moderacion.resolver(req.repositorio, req.usuario, req.params.id, req.body || {})
  );
});

/** Denuncias presentadas por la propia sesión. */
export const misDenuncias = asyncHandler(async (req, res) => {
  res.json(await moderacion.misDenuncias(req.repositorio, req.usuario));
});

/* --------------------------------------------------------------- contenido */

export const ocultarIncidencia = asyncHandler(async (req, res) => {
  const resultado = await moderacion.ocultarIncidencia(req.repositorio, req.usuario, req.params.id, {
    oculta: req.body?.oculta !== false,
    motivo: req.body?.motivo || ''
  });
  res.json(resultado);
});

export const ocultarComentario = asyncHandler(async (req, res) => {
  const resultado = await moderacion.ocultarComentario(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.params.comentarioId,
    {
      oculto: req.body?.oculto !== false,
      motivo: req.body?.motivo || ''
    }
  );
  res.json(resultado);
});

/* ---------------------------------------------------------------- cuentas */

export const advertir = asyncHandler(async (req, res) => {
  const incidencia = await moderacion.advertirDesdeIncidencia(
    req.repositorio,
    req.usuario,
    req.params.id,
    { motivo: req.body?.motivo || '' }
  );
  res.json(incidencia);
});

export const suspender = asyncHandler(async (req, res) => {
  const resultado = await moderacion.suspenderCuenta(
    req.repositorio,
    req.usuario,
    req.params.username,
    { motivo: req.body?.motivo || '', hasta: req.body?.hasta || null }
  );
  res.json(resultado);
});

export const reactivar = asyncHandler(async (req, res) => {
  res.json(await moderacion.reactivarCuenta(req.repositorio, req.usuario, req.params.username));
});

export const cuenta = asyncHandler(async (req, res) => {
  res.json(await moderacion.cuenta(req.repositorio, req.usuario, req.params.username));
});

export const sanciones = asyncHandler(async (req, res) => {
  res.json({ cuentas: await moderacion.sanciones(req.repositorio, req.usuario) });
});
