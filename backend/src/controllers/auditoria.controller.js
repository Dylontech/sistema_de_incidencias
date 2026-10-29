/** Controlador HTTP de la bitácora de auditoría. */
import { asyncHandler } from '../utils/AppError.js';
import * as auditoria from '../services/auditoria.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json({ registros: await auditoria.listar(req.repositorio, req.query || {}) });
});
