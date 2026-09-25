/** Middleware de carga de archivos (multipart) para la evidencia. */
import multer from 'multer';
import { config } from '../config/index.js';
import { EVIDENCIA_POLITICA } from '../config/constantes.js';
import { nuevoId } from '../utils/ids.js';
import { asegurarDirectorio, errorMime, extensionDe, mimePermitido } from '../services/uploads.service.js';

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
    // Solo fotografías (y el PDF de la resolución): el tope absoluto es el de
    // una foto, así que no se escribe en disco ningún archivo mayor.
    fileSize: config.evidencia.maxFotoBytes,
    files: EVIDENCIA_POLITICA.maxArchivosPorCarga
  },
  fileFilter: (req, file, cb) => {
    if (!mimePermitido(file.mimetype)) return cb(errorMime(file.mimetype));
    cb(null, true);
  }
}).array('archivos', EVIDENCIA_POLITICA.maxArchivosPorCarga);
