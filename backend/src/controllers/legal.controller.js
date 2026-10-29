/** Controlador de documentos legales editables y aceptaciones. */
import { asyncHandler } from '../utils/AppError.js';
import * as legal from '../services/legal.service.js';
import * as aceptaciones from '../services/aceptaciones.service.js';

export const listarPublicados = asyncHandler(async (req, res) => {
  res.json({ documentos: await legal.listarPublicados(req.repositorio) });
});

export const obtenerPublicado = asyncHandler(async (req, res) => {
  res.json({ documento: await legal.publicado(req.repositorio, req.params.clave) });
});

export const estadoAceptacion = asyncHandler(async (req, res) => {
  res.json(await aceptaciones.estadoAceptacion(req.repositorio, req.usuario));
});

export const aceptar = asyncHandler(async (req, res) => {
  res.json(
    await aceptaciones.aceptar(req.repositorio, req.usuario, req.body || {}, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || ''
    })
  );
});

export const listarAdmin = asyncHandler(async (req, res) => {
  res.json({ documentos: await legal.listarAdministracion(req.repositorio) });
});

export const obtenerAdmin = asyncHandler(async (req, res) => {
  res.json(await legal.administrar(req.repositorio, req.params.clave));
});

export const guardarBorrador = asyncHandler(async (req, res) => {
  const documento = await legal.guardarBorrador(
    req.repositorio,
    req.usuario,
    req.params.clave,
    req.body || {}
  );
  res.json({ documento });
});

export const publicar = asyncHandler(async (req, res) => {
  const documento = await legal.publicar(req.repositorio, req.usuario, req.params.clave);
  res.json({ documento });
});

export const restaurar = asyncHandler(async (req, res) => {
  const documento = await legal.restaurar(
    req.repositorio,
    req.usuario,
    req.params.clave,
    req.params.version
  );
  res.json({ documento });
});

export const historial = asyncHandler(async (req, res) => {
  res.json({ historial: await legal.historial(req.repositorio, req.params.clave) });
});
