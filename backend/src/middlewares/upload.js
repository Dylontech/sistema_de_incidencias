/** Middleware de carga de archivos (multipart) para la evidencia. */
import multer from 'multer';
import { config } from '../config/index.js';
import { EVIDENCIA_POLITICA } from '../config/constantes.js';
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { asegurarDirectorio, extensionDe, mimePermitido } from '../services/uploads.service.js';

const almacenamiento = multer.diskStorage({
  destination: (req, file, cb) => {
    asegurarDirectorio()
      .then(() => cb(null, config.paths.uploads))
      .catch(cb);
  },
  // Nombre aleatorio (UUID) para que la URL sea impredecible.
  filename: (req, file, cb) => cb(null, `${nuevoId()}${extensionDe(file.mimetype, file.originalname)}`)
});

export const recibirArchivos = multer({
  storage: almacenamiento,
  limits: {
    // El límite fino (100 MB imagen / 1 GB video) se valida después con el
    // mimetype real; aquí se usa el máximo absoluto.
    fileSize: config.evidencia.maxVideoBytes,
    files: EVIDENCIA_POLITICA.maxArchivosPorCarga
  },
  fileFilter: (req, file, cb) => {
    if (!mimePermitido(file.mimetype)) {
      return cb(AppError.solicitudInvalida(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
    cb(null, true);
  }
}).array('archivos', EVIDENCIA_POLITICA.maxArchivosPorCarga);
