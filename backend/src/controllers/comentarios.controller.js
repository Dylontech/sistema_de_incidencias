/** Controlador de comentarios y restricciones. */
import { asyncHandler } from '../utils/AppError.js';
import * as comentarios from '../services/comentarios.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json(
    await comentarios.listar(req.repositorio, req.usuario, req.params.id, {
      pagina: req.query.pagina,
      limite: req.query.limite
    })
  );
});

export const crear = asyncHandler(async (req, res) => {
  const comentario = await comentarios.crear(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body || {}
  );
  // Compatibilidad con la vista de detalle: además del comentario se devuelve
  // la incidencia hidratada para que el cliente pueda repintar la lista.
  const incidencia = await req.repositorio.incidenciaPorId(req.params.id);
  res.status(201).json({ comentario, incidencia });
});

export const eliminar = asyncHandler(async (req, res) => {
  res.json({
    comentario: await comentarios.eliminar(
      req.repositorio,
      req.usuario,
      req.params.id,
      req.params.comentarioId
    )
  });
});

export const restringirCuenta = asyncHandler(async (req, res) => {
  res.status(201).json({
    restriccion: await comentarios.restringirCuenta(
      req.repositorio,
      req.usuario,
      req.params.username,
      req.body || {}
    )
  });
});

export const levantarCuenta = asyncHandler(async (req, res) => {
  res.json(
    await comentarios.levantarRestriccionCuenta(req.repositorio, req.usuario, req.params.username)
  );
});

export const restringirUserKey = asyncHandler(async (req, res) => {
  res.status(201).json({
    restriccion: await comentarios.restringirUserKey(
      req.repositorio,
      req.usuario,
      req.body?.userKey,
      req.body || {}
    )
  });
});

export const levantarUserKey = asyncHandler(async (req, res) => {
  res.json(
    await comentarios.levantarRestriccionUserKey(req.repositorio, req.usuario, req.body?.userKey)
  );
});
