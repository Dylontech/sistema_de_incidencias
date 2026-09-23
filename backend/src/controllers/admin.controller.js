/** Controlador HTTP de tareas administrativas. */
import { asyncHandler } from '../utils/AppError.js';
import * as incidencias from '../services/incidencias.service.js';
import { importarRespaldo } from '../services/importacion.service.js';

/** Restablece los datos (paridad con `Reportes.limpiarTodo`). */
export const limpiar = asyncHandler(async (req, res) => {
  const resultado = await incidencias.limpiar(req.repositorio, req.usuario);
  res.json({ ...resultado, mensaje: 'Datos eliminados correctamente' });
});

/** Importa un respaldo exportado por el monolito (JSON con base64). */
export const importar = asyncHandler(async (req, res) => {
  const resultado = await importarRespaldo(req.repositorio, req.body || {});
  res.status(201).json(resultado);
});
