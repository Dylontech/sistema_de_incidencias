/**
 * SERVICIO: Evidencia multimedia.
 *
 * La evidencia es **solo de fotografías** (y PDF como documento de la
 * resolución): el video se retiró. El monolito guardaba las fotos y videos como
 * base64 dentro del JSON de la incidencia, lo que hacía inviable cualquier
 * archivo real (la cuota de localStorage era de ~5 MB frente a 100 MB de foto).
 * Ahora el archivo vive en disco y el documento guarda solo sus metadatos.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import { EVIDENCIA_POLITICA } from '../config/constantes.js';
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';

export function extensionDe(mime, nombreOriginal = '') {
  if (EVIDENCIA_POLITICA.extensiones[mime]) return EVIDENCIA_POLITICA.extensiones[mime];
  const ext = path.extname(nombreOriginal).toLowerCase();
  return ext && ext.length <= 6 ? ext : '';
}

export function mimePermitido(mime) {
  return EVIDENCIA_POLITICA.mimesPermitidos.some((prefijo) => String(mime || '').startsWith(prefijo));
}

/**
 * Límite aplicable a un archivo.
 *
 * Las fotografías (y el PDF de la resolución) comparten el mismo límite; el
 * video ya no se admite, así que no hay un límite mayor para él.
 */
export function limiteDe() {
  return config.evidencia.maxFotoBytes || EVIDENCIA_POLITICA.maxFotoBytes;
}

/**
 * Mensaje de rechazo de un archivo según su tipo.
 * El video tiene el suyo propio: es un caso que el ciudadano entiende al vuelo.
 */
export function errorMime(mime) {
  if (String(mime || '').startsWith('video/')) {
    return AppError.solicitudInvalida(
      'Solo se admiten fotografías: ya no se pueden subir videos'
    );
  }
  return AppError.solicitudInvalida(`Tipo de archivo no permitido: ${mime}`);
}

export async function asegurarDirectorio() {
  await fs.mkdir(config.paths.uploads, { recursive: true });
}

/** Metadatos que se guardan en la incidencia a partir de un archivo en disco. */
export function metadatosDeArchivo(archivo) {
  const nombreFisico = path.basename(archivo.path || archivo.filename || '');
  return {
    id: nuevoId(),
    nombre: archivo.originalname || nombreFisico,
    tipo: archivo.mimetype || 'application/octet-stream',
    tamano: Number(archivo.size) || 0,
    url: `/uploads/${nombreFisico}`,
    // Vestigio del video (ya no se suben); se conserva para leer evidencia antigua.
    duracion: null
  };
}

/** Elimina un archivo subido que no cumple la política. */
export async function descartar(archivo) {
  try {
    if (archivo?.path) await fs.unlink(archivo.path);
  } catch {
    /* el archivo ya no está: nada que hacer */
  }
}

/** Valida los archivos que multer ya dejó en disco. */
export async function validarArchivos(archivos = []) {
  const validos = [];
  for (const archivo of archivos) {
    if (!mimePermitido(archivo.mimetype)) {
      await descartar(archivo);
      throw errorMime(archivo.mimetype);
    }
    if (archivo.size > limiteDe()) {
      const mb = Math.round(limiteDe() / (1024 * 1024));
      await descartar(archivo);
      throw AppError.solicitudInvalida(`"${archivo.originalname}" excede el límite de ${mb} MB`);
    }
    validos.push(metadatosDeArchivo(archivo));
  }
  return validos;
}

export function rutaDeUrl(url) {
  const nombre = path.basename(String(url || ''));
  return path.join(config.paths.uploads, nombre);
}

/** Guarda un contenido base64 (respaldos del monolito) como archivo real. */
export async function guardarDesdeBase64(dataUrl, nombreOriginal = 'evidencia') {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(String(dataUrl || ''));
  if (!m) return null;

  const mime = m[1];
  const contenido = Buffer.from(m[2], 'base64');
  // Al importar se admite también el video que ya existía en el respaldo.
  if (contenido.length > EVIDENCIA_POLITICA.maxImportacionBytes) return null;

  await asegurarDirectorio();
  const nombreFisico = `${nuevoId()}${extensionDe(mime, nombreOriginal)}`;
  await fs.writeFile(path.join(config.paths.uploads, nombreFisico), contenido);

  return {
    id: nuevoId(),
    nombre: nombreOriginal,
    tipo: mime,
    tamano: contenido.length,
    url: `/uploads/${nombreFisico}`,
    duracion: null
  };
}

/** Calcula el tamaño total de la evidencia de una lista de incidencias. */
export async function pesoDeEvidencia(incidencias = []) {
  let total = 0;
  for (const incidencia of incidencias) {
    for (const ev of [...(incidencia.evidencia || []), ...(incidencia.evidenciaSolucion || [])]) {
      total += Number(ev.tamano) || 0;
    }
  }
  return total;
}
