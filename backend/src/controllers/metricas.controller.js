/** Controlador del panel de recursos del servidor. */
import { asyncHandler } from '../utils/AppError.js';
import { historicoMuestras, muestra } from '../services/metricas.service.js';

export const actual = asyncHandler(async (req, res) => {
  res.json(await muestra(req.repositorio));
});

export const historico = asyncHandler(async (req, res) => {
  res.json({ muestras: historicoMuestras() });
});
