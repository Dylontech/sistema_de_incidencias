/**
 * Controlador HTTP de carga de evidencia.
 * Los archivos se suben primero y luego se adjuntan a la incidencia
 * (en la creación, en la edición o al resolver) como metadatos.
 */
import { asyncHandler } from '../utils/AppError.js';
import { AppError } from '../utils/AppError.js';
import { validarArchivos } from '../services/uploads.service.js';

export const subir = asyncHandler(async (req, res) => {
  const archivos = req.files || [];
  if (!archivos.length) {
    throw AppError.solicitudInvalida('No se recibió ningún archivo en el campo "archivos"');
  }
  const evidencia = await validarArchivos(archivos);
  res.status(201).json({ evidencia });
});
