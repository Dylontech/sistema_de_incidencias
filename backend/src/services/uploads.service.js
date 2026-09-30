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

/**
 * Extensión con la que se guarda un archivo.
 *
 * Sale **solo** del mapa de tipos permitidos: antes se caía a la extensión del
 * nombre original, que la elige quien sube (así entraba un `.svg`).
 */
export function extensionDe(mime) {
  return EVIDENCIA_POLITICA.extensiones[String(mime || '').toLowerCase()] || '';
}

export function mimePermitido(mime) {
  return EVIDENCIA_POLITICA.mimesPermitidos.includes(String(mime || '').toLowerCase());
}

/**
 * Tipo real de un archivo según sus primeros bytes (null si no lo reconocemos).
 *
 * El `Content-Type` de una subida lo pone el cliente, así que por sí solo no
 * basta: un guion con `image/png` se colaría en disco y luego se serviría como
 * imagen. Las firmas son las de los formatos que aceptamos.
 */
export function detectarTipo(contenido) {
  const empiezaPor = (firma, desde = 0) => firma.every((valor, i) => contenido[desde + i] === valor);

  if (empiezaPor([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (empiezaPor([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (empiezaPor([0x47, 0x49, 0x46, 0x38])) return 'image/gif'; // GIF87a / GIF89a
  // WEBP vive dentro de un contenedor RIFF: «RIFF????WEBP».
  if (empiezaPor([0x52, 0x49, 0x46, 0x46]) && empiezaPor([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  // El PDF puede llevar bytes sueltos antes de la cabecera, así que se busca.
  if (contenido.includes('%PDF-')) return 'application/pdf';
  return null;
}

/** Lee solo el arranque del archivo: no hace falta cargar la foto entera. */
async function leerCabecera(ruta, bytes = EVIDENCIA_POLITICA.bytesDeFirma) {
  const manejador = await fs.open(ruta, 'r');
  try {
    const bufer = Buffer.alloc(bytes);
    const { bytesRead } = await manejador.read(bufer, 0, bytes, 0);
    return bufer.subarray(0, bytesRead);
  } finally {
    await manejador.close();
  }
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
 * Tope del conjunto de archivos de una misma petición.
 *
 * Multer solo limita archivo a archivo, así que sin este tope una carga de 20
 * fotos podría escribir cientos de megabytes de golpe.
 */
export function limiteCargaDe() {
  return config.evidencia.maxCargaBytes || EVIDENCIA_POLITICA.maxCargaBytes;
}

/** Tamaño en unidades legibles, para los mensajes de error (60 MB, 900 KB…). */
export function pesoLegible(bytes) {
  const total = Number(bytes) || 0;
  if (total >= 1024 * 1024) return `${Math.round(total / (1024 * 1024))} MB`;
  return `${Math.round(total / 1024)} KB`;
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
  // El tope del CONJUNTO se comprueba aquí, y no mientras llega el cuerpo:
  // multer escribe cada parte en cuanto la recibe y las atiende en paralelo, así
  // que no hay un punto intermedio fiable donde cortar sin romper el flujo. Si
  // la carga se pasa, se descarta entera.
  const peso = archivos.reduce((total, archivo) => total + (Number(archivo.size) || 0), 0);
  if (peso > limiteCargaDe()) {
    await Promise.all(archivos.map((archivo) => descartar(archivo)));
    throw new AppError(
      413,
      `La evidencia de una misma carga no puede pasar de ${pesoLegible(limiteCargaDe())}`
    );
  }

  const validos = [];
  for (const archivo of archivos) {
    const mime = String(archivo.mimetype || '').toLowerCase();

    if (!mimePermitido(mime)) {
      await descartar(archivo);
      throw errorMime(archivo.mimetype);
    }

    if (archivo.size > limiteDe()) {
      await descartar(archivo);
      throw new AppError(413, `"${archivo.originalname}" excede el límite de ${pesoLegible(limiteDe())}`);
    }

    // El tipo declarado tiene que coincidir con el contenido real del archivo.
    const real = detectarTipo(await leerCabecera(archivo.path));
    if (real !== mime) {
      await descartar(archivo);
      throw AppError.solicitudInvalida(
        real
          ? `"${archivo.originalname}" contiene un archivo ${real}, no ${mime}`
          : `"${archivo.originalname}" no es una imagen ni un PDF válidos`
      );
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

/* -------------------------- ciclo de vida del archivo ------------------------ */

/** Borra del disco los archivos de una lista de URLs (las que falten se ignoran). */
export async function borrarArchivos(urls = []) {
  let borrados = 0;
  for (const url of urls) {
    try {
      await fs.unlink(rutaDeUrl(url));
      borrados++;
    } catch {
      /* el archivo ya no estaba: nada que hacer */
    }
  }
  return borrados;
}

/** URLs de toda la evidencia (la del reporte y la de la resolución). */
export function urlsDeEvidencia(incidencia) {
  return [...(incidencia?.evidencia || []), ...(incidencia?.evidenciaSolucion || [])]
    .map((ev) => ev?.url)
    .filter(Boolean);
}

/**
 * Borra los archivos de una incidencia. Se llama al eliminar el documento: si no,
 * la foto seguiría accesible por su URL aunque el reporte ya no exista.
 */
export async function borrarEvidenciaDeIncidencia(incidencia) {
  return borrarArchivos(urlsDeEvidencia(incidencia));
}

/**
 * Archivos que hay en el directorio de evidencia, con su tamaño y su fecha.
 *
 * Lo usa `scripts/limpiar-evidencias.mjs` para localizar los huérfanos: los que
 * quedaron de una subida que nunca llegó a guardarse como reporte.
 */
export async function archivosEnDisco() {
  await asegurarDirectorio();
  const nombres = await fs.readdir(config.paths.uploads);
  const archivos = [];
  for (const nombre of nombres) {
    // Los archivos ocultos (`.gitkeep`) no los genera la aplicación: quedan
    // fuera para que la limpieza de huérfanos no los borre.
    if (nombre.startsWith('.')) continue;
    const ruta = path.join(config.paths.uploads, nombre);
    const info = await fs.stat(ruta).catch(() => null);
    if (info?.isFile()) {
      archivos.push({ nombre, ruta, tamano: info.size, modificado: info.mtime });
    }
  }
  return archivos;
}
