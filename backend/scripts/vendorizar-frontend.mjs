/**
 * Copia a `frontend/vendor/` las librerías que antes dependían de una CDN
 * (Leaflet, Bootstrap Icons y Paged.js para el informe imprimible).
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
const PAGEDJS = '0.4.3';

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
  ],
  // Paged.js pagina el informe imprimible y aporta márgenes, pie y contadores
  // de página compatibles con la impresión del navegador.
  [
    'pagedjs/paged.polyfill.js',
    `https://cdn.jsdelivr.net/npm/pagedjs@${PAGEDJS}/dist/paged.polyfill.js`
  ]
];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/**
 * Paged.js inserta sus reglas con etiquetas `<style>`, que la CSP del proyecto
 * bloquea (`style-src 'self'`). Se cambia solo el almacenamiento de esas reglas
 * a una hoja CSSOM adoptada, manteniendo intacta la API de paginación.
 */
function parchearPagedjs(buffer) {
  let texto = buffer.toString('utf8');
  if (texto.includes('data-pagedjs-cssom')) return buffer;

  const setup = /this\.base = this\.insert\(baseStyles\);[\s\S]*?return this\.styleSheet;/;
  texto = texto.replace(
    setup,
    `/* data-pagedjs-cssom */\n` +
      `\t\tthis.styleSheet = new CSSStyleSheet();\n` +
      `\t\tdocument.adoptedStyleSheets = [...document.adoptedStyleSheets, this.styleSheet];\n` +
      `\t\tthis.base = this.insert(baseStyles);\n` +
      `\t\treturn this.styleSheet;`
  );

  const insert = /insert\(text\)\s*\{\s*let head[\s\S]*?return style;\s*\}/;
  texto = texto.replace(
    insert,
    `insert(text) {\n` +
      `\t\t\tif (!this.styleSheet) {\n` +
      `\t\t\t\tthis.styleSheet = new CSSStyleSheet();\n` +
      `\t\t\t\tdocument.adoptedStyleSheets = [...document.adoptedStyleSheets, this.styleSheet];\n` +
      `\t\t\t}\n` +
      `\t\t\tthis.cssPagedjsText = (this.cssPagedjsText || '') + '\\n' + text;\n` +
      `\t\t\tthis.styleSheet.replaceSync(this.cssPagedjsText);\n` +
      `\t\t\tthis.inserted.push({ remove() {} });\n` +
      `\t\t\treturn this.styleSheet;\n` +
      `\t\t}`
  );

  const destroy = /destroy\(\)\s*\{\s*this\.styleEl\.remove\(\);[\s\S]*?this\.sheets = \[\];\s*\}/;
  texto = texto.replace(
    destroy,
    `destroy() {\n` +
      `\t\t\tdocument.adoptedStyleSheets = document.adoptedStyleSheets.filter(\n` +
      `\t\t\t\t(sheet) => sheet !== this.styleSheet\n` +
      `\t\t\t);\n` +
      `\t\t\tthis.inserted.forEach((s) => s.remove());\n` +
      `\t\t\tthis.sheets = [];\n` +
      `\t\t}`
  );

  if (!texto.includes('data-pagedjs-cssom')) {
    throw new Error('No se pudo parchear Paged.js para usar CSSOM con la CSP estricta');
  }
  return Buffer.from(texto);
}

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
    pagedjs: PAGEDJS,
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
    if (relativo === 'pagedjs/paged.polyfill.js') contenido = parchearPagedjs(contenido);
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
