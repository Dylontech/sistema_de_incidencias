/** Controlador HTTP de la bitácora de auditoría. */
import { asyncHandler } from '../utils/AppError.js';
import * as auditoria from '../services/auditoria.service.js';
import { generarInforme } from '../services/auditoria-informe.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json({ registros: await auditoria.listar(req.repositorio, req.query || {}) });
});

export const informe = asyncHandler(async (req, res) => {
  const filtros = auditoria.filtrosDe(req.query || {});
  const registros = await auditoria.listar(req.repositorio, { ...filtros, limite: 5000 });
  const { contenido, mime, extension } = await generarInforme(
    registros,
    filtros,
    req.query.formato || 'pdf'
  );
  const dia = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="auditoria-${dia}.${extension}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(contenido);
});
