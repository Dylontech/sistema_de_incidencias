/**
 * Copia a `frontend/vendor/` las dos librerías que hasta ahora se cargaban desde
 * una CDN (Leaflet y Bootstrap Icons).
 *
 * Motivo: la Content-Security-Policy queda en `script-src 'self'` / `style-src
 * 'self'`, sin depender de terceros (menos superficie y sin sorpresas si una CDN
 * cambia o desaparece). Los archivos descargados se versionan con el repositorio.
 *
 *   npm run vendorizar-frontend              verifica contra vendor.lock.json
 *   npm run vendorizar-frontend -- --actualizar   vuelve a descargar y reescribe el lock
 *
 * El lock guarda el sha256 de cada archivo: si algo cambia en origen, el comando
 * falla en lugar de colar una versión distinta sin querer.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = path.resolve(AQUI, '../../frontend/vendor');
const LOCK = path.join(DESTINO, 'vendor.lock.json');

const LEAFLET = '1.9.4';
const BOOTSTRAP_ICONS = '1.11.1';

/** Cada entrada: archivo local -> URL de origen (jsDelivr, con versión fija). */
const ARCHIVOS = [
  // Leaflet: el JS, el CSS y las imágenes que el CSS y los iconos por omisión
  // resuelven de forma relativa a la hoja de estilos.
  ['leaflet/leaflet.js', `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET}/dist/leaflet.js`],
  ['leaflet/leaflet.css', `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET}/dist/leaflet.css`],
  ['leaflet/images/layers.png', `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET}/dist/images/layers.png`],
  ['leaflet/images/layers-2x.png', `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET}/dist/images/layers-2x.png`],
  ['leaflet/images/marker-icon.png', `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET}/dist/images/marker-icon.png`],
  ['leaflet/images/marker-icon-2x.png', `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET}/dist/images/marker-icon-2x.png`],
  ['leaflet/images/marker-shadow.png', `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET}/dist/images/marker-shadow.png`],
  // Bootstrap Icons: la hoja de estilos (los `bi-*`) y las dos fuentes que
  // declara con rutas relativas `./fonts/…`.
  [
    'bootstrap-icons/bootstrap-icons.css',
    `https://cdn.jsdelivr.net/npm/bootstrap-icons@${BOOTSTRAP_ICONS}/font/bootstrap-icons.css`
  ],
  [
    'bootstrap-icons/fonts/bootstrap-icons.woff2',
    `https://cdn.jsdelivr.net/npm/bootstrap-icons@${BOOTSTRAP_ICONS}/font/fonts/bootstrap-icons.woff2`
  ],
  [
    'bootstrap-icons/fonts/bootstrap-icons.woff',
    `https://cdn.jsdelivr.net/npm/bootstrap-icons@${BOOTSTRAP_ICONS}/font/fonts/bootstrap-icons.woff`
  ]
];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function leerLock() {
  try {
    return JSON.parse(await fs.readFile(LOCK, 'utf8'));
  } catch {
    return null;
  }
}

async function descargar(url) {
  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    throw new Error(`No se pudo descargar ${url} (HTTP ${respuesta.status})`);
  }
  return Buffer.from(await respuesta.arrayBuffer());
}

async function main() {
  const actualizar = process.argv.includes('--actualizar');
  const lock = await leerLock();

  const nuevoLock = {
    generado: new Date().toISOString(),
    leaflet: LEAFLET,
    bootstrapIcons: BOOTSTRAP_ICONS,
    archivos: {}
  };

  for (const [relativo, url] of ARCHIVOS) {
    const destino = path.join(DESTINO, relativo);
    const esperado = lock?.archivos?.[relativo]?.sha256;

    let contenido;
    if (!actualizar && esperado) {
      try {
        const enDisco = await fs.readFile(destino);
        if (sha256(enDisco) === esperado) {
          nuevoLock.archivos[relativo] = { sha256: esperado, url };
          console.log(`· ${relativo} (ya estaba)`);
          continue;
        }
      } catch {
        // No está en disco: se descarga.
      }
    }

    contenido = await descargar(url);
    const hash = sha256(contenido);

    if (!actualizar && esperado && esperado !== hash) {
      throw new Error(
        `${relativo}: el contenido descargado no coincide con vendor.lock.json.\n` +
          `  esperado ${esperado}\n  recibido ${hash}\n` +
          'Si el cambio es intencionado, ejecuta con --actualizar.'
      );
    }

    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, contenido);
    nuevoLock.archivos[relativo] = { sha256: hash, url };
    console.log(`✓ ${relativo} (${(contenido.length / 1024).toFixed(1)} kB)`);
  }

  await fs.mkdir(DESTINO, { recursive: true });
  await fs.writeFile(LOCK, `${JSON.stringify(nuevoLock, null, 2)}\n`);
  console.log(`\nDependencias copiadas en frontend/vendor/ (lock: ${path.basename(LOCK)}).`);
}

await main();
