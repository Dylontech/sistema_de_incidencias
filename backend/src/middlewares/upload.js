/** Middleware de carga de archivos (multipart) para la evidencia. */
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config/index.js';
import { EVIDENCIA_POLITICA } from '../config/constantes.js';
import { nuevoId } from '../utils/ids.js';
import { asegurarDirectorio, errorMime, extensionDe, mimePermitido } from '../services/uploads.service.js';
import { ADJUNTOS_POLITICA } from '../services/adjuntos.service.js';

const almacenamiento = multer.diskStorage({
  destination: (req, file, cb) => {
    asegurarDirectorio()
      .then(() => cb(null, config.paths.uploads))
      .catch(cb);
  },
  // Nombre aleatorio (UUID) para que la URL sea impredecible.
  filename: (req, file, cb) => cb(null, `${nuevoId()}${extensionDe(file.mimetype, file.originalname)}`)
});

const carpetaAdjuntos = path.join(config.paths.uploads, 'adjuntos');
const almacenamientoAdjuntos = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdir(carpetaAdjuntos, { recursive: true })
      .then(() => cb(null, carpetaAdjuntos))
      .catch(cb);
  },
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

/** Un solo archivo para el logo del informe (campo `archivo`). */
export const recibirLogotipo = multer({
  storage: almacenamiento,
  limits: { fileSize: config.evidencia.maxFotoBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!['image/png', 'image/jpeg'].includes(String(file.mimetype || ''))) {
      return cb(errorMime(file.mimetype));
    }
    cb(null, true);
  }
}).single('archivo');

/** Imágenes rasterizadas para publicidad (el SVG se convierte en el cliente). */
export const recibirImagenPublicidad = multer({
  storage: almacenamiento,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(String(file.mimetype || ''))) {
      return cb(errorMime(file.mimetype));
    }
    cb(null, true);
  }
}).single('archivo');

function recibirAdjunto(proposito) {
  const politica = ADJUNTOS_POLITICA[proposito] || ADJUNTOS_POLITICA.chat;
  return multer({
    storage: almacenamientoAdjuntos,
    limits: { fileSize: politica.maxBytes, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!politica.mimes.includes(String(file.mimetype || ''))) {
        return cb(errorMime(file.mimetype));
      }
      cb(null, true);
    }
  }).single('archivo');
}

export const recibirAdjuntoChat = recibirAdjunto('chat');
export const recibirAdjuntoComentario = recibirAdjunto('comentario');
