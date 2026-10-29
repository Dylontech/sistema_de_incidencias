/** Controlador de historial de folios. */
import { asyncHandler } from '../utils/AppError.js';
import * as folios from '../services/folios.service.js';

export const mios = asyncHandler(async (req, res) => {
  res.json(
    await folios.mios(req.repositorio, req.usuario, {
      texto: req.query.texto || '',
      tipo: req.query.tipo || null,
      desde: req.query.desde || null,
      hasta: req.query.hasta || null,
      pagina: req.query.pagina,
      limite: req.query.limite
    })
  );
});

export const detalle = asyncHandler(async (req, res) => {
  res.json({ folio: await folios.detalle(req.repositorio, req.usuario, req.params.folio) });
});

export const todos = asyncHandler(async (req, res) => {
  res.json(
    await folios.todos(req.repositorio, req.usuario, {
      texto: req.query.texto || '',
      tipo: req.query.tipo || null,
      desde: req.query.desde || null,
      hasta: req.query.hasta || null,
      pagina: req.query.pagina,
      limite: req.query.limite
    })
  );
});
