/**
 * SERVICIO: Evidencia multimedia.
 *
 * El monolito guardaba las fotos y videos como base64 dentro del JSON de la
 * incidencia, lo que hacía inviable cualquier archivo real (la cuota de
 * localStorage era de ~5 MB frente a límites de 100 MB/1 GB).
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
 * Límite aplicable según el tipo de archivo.
 * Paridad con el monolito: 100 MB para imágenes y PDF, 1 GB para video.
 */
export function limiteDe(mime) {
  if (String(mime || '').startsWith('video/')) {
    return config.evidencia.maxVideoBytes || EVIDENCIA_POLITICA.maxVideoBytes;
  }
  return config.evidencia.maxFotoBytes || EVIDENCIA_POLITICA.maxFotoBytes;
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
    duracion: null // la duración la valida el navegador (aquí no hay ffprobe)
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
      throw AppError.solicitudInvalida(`Tipo de archivo no permitido: ${archivo.mimetype}`);
    }
    if (archivo.size > limiteDe(archivo.mimetype)) {
      const mb = Math.round(limiteDe(archivo.mimetype) / (1024 * 1024));
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
  if (contenido.length > limiteDe(mime)) return null;

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
