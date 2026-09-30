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
  // Nombre aleatorio (UUID) para que la URL sea impredecible. La extensión sale
  // del tipo permitido, nunca del nombre que envía el cliente.
  filename: (req, file, cb) => cb(null, `${nuevoId()}${extensionDe(file.mimetype)}`)
});

export const recibirArchivos = multer({
  storage: almacenamiento,
  limits: {
    // Solo fotografías (y el PDF de la resolución): el tope por archivo lo
    // aplica busboy mientras llega el cuerpo, así que no se escribe en disco
    // nada mayor. El tope del CONJUNTO se comprueba al terminar la carga
    // (`validarArchivos`), porque multer atiende los archivos en paralelo y no
    // hay un punto intermedio fiable donde cortar sin romper el flujo.
    fileSize: config.evidencia.maxFotoBytes,
    files: EVIDENCIA_POLITICA.maxArchivosPorCarga
  },
  fileFilter: (req, file, cb) => {
    if (!mimePermitido(file.mimetype)) return cb(errorMime(file.mimetype));
    cb(null, true);
  }
}).array('archivos', EVIDENCIA_POLITICA.maxArchivosPorCarga);
