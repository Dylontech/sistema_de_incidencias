#!/usr/bin/env node
/**
 * Generador del paquete de mapas offline (PMTiles).
 *
 * REGLAS QUE RESPETA ESTE SCRIPT:
 *  - No descarga teselas de tile.openstreetmap.org, OpenTopoMap ni Esri.
 *  - Descarga un extracto .osm.pbf de Geofabrik (datos OSM, licencia ODbL).
 *  - Genera teselas propias con tilemaker (open source) y las empaqueta con
 *    pmtiles (open source).
 *  - El resultado se distribuye con atribución «© OpenStreetMap contributors»
 *    y el aviso ODbL de `recursos/mapas/LEEME.txt`.
 *
 * Requisitos (se explican si faltan):
 *  - tilemaker >= 2.4  (https://github.com/systemed/tilemaker)
 *  - pmtiles CLI       (npm i -g pmtiles)
 *  - Espacio en disco: ~1 GB para el extracto de México y ~300 MB para el PMTiles.
 *
 * Uso:
 *   node scripts/generar-mapas-offline.mjs --descargar
 *   node scripts/generar-mapas-offline.mjs --osm ruta/al/extracto.osm.pbf
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');
const CARPETA = path.join(RAIZ, 'recursos', 'mapas');
const URL_MEXICO = 'https://download.geofabrik.de/north-america/mexico-latest.osm.pbf';

function argumentos() {
  const salida = { descargar: false, osm: null, forzar: false, config: null, proceso: null };
  const lista = process.argv.slice(2);
  for (let i = 0; i < lista.length; i += 1) {
    if (lista[i] === '--descargar') salida.descargar = true;
    else if (lista[i] === '--forzar') salida.forzar = true;
    else if (lista[i] === '--osm') salida.osm = lista[++i];
    else if (lista[i] === '--config') salida.config = lista[++i];
    else if (lista[i] === '--proceso') salida.proceso = lista[++i];
  }
  return salida;
}

function comandoDisponible(nombre) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [nombre], {
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

function instrucciones() {
  console.log(`
Mapas offline — Sistema de Incidencias Municipales

Este script NO descarga teselas de los servidores públicos de OSM.
Genera teselas propias a partir de un extracto de datos abiertos.

Pasos:
  1. Instala las herramientas open source:
       - tilemaker: https://github.com/systemed/tilemaker
       - pmtiles:   npm install -g pmtiles
  2. Descarga el extracto de datos (una sola vez):
       node scripts/generar-mapas-offline.mjs --descargar
     O usa uno que ya tengas:
       node scripts/generar-mapas-offline.mjs --osm C:\\datos\\mexico.osm.pbf
  3. El resultado queda en:
       desktop/recursos/mapas/incidencias.pmtiles
  4. Vuelve a empaquetar la app (npm run dist:win / dist:linux).

Aviso legal: los datos son © OpenStreetMap contributors y se distribuyen
bajo ODbL. Conserva la atribución y el archivo LEEME.txt junto al paquete.
`);
}

async function descargar(destino) {
  console.log(`[mapas] descargando extracto de Geofabrik (puede tardar varios minutos)…`);
  const respuesta = await fetch(URL_MEXICO);
  if (!respuesta.ok || !respuesta.body) {
    throw new Error(`No se pudo descargar el extracto: HTTP ${respuesta.status}`);
  }
  const total = Number(respuesta.headers.get('content-length')) || 0;
  let recibido = 0;
  const flujo = Readable.fromWeb(respuesta.body);
  flujo.on('data', (trozo) => {
    recibido += trozo.length;
    if (total && recibido % (25 * 1024 * 1024) < trozo.length) {
      process.stdout.write(`\r[mapas] ${((recibido / total) * 100).toFixed(1)}%`);
    }
  });
  await new Promise((resolver, rechazar) => {
    const archivo = createWriteStream(destino);
    flujo.pipe(archivo);
    archivo.on('finish', resolver);
    archivo.on('error', rechazar);
    flujo.on('error', rechazar);
  });
  process.stdout.write('\n');
}

function ejecutar(comando, args) {
  console.log(`[mapas] ${comando} ${args.join(' ')}`);
  execFileSync(comando, args, { stdio: 'inherit' });
}

async function principal() {
  const opciones = argumentos();
  mkdirSync(CARPETA, { recursive: true });

  if (!comandoDisponible('tilemaker') || !comandoDisponible('pmtiles')) {
    instrucciones();
    console.error('[mapas] faltan herramientas: instala tilemaker y pmtiles antes de continuar.');
    process.exit(1);
  }

  const extracto = opciones.osm
    ? path.resolve(opciones.osm)
    : path.join(CARPETA, 'mexico-latest.osm.pbf');

  if (!existsSync(extracto)) {
    if (!opciones.descargar) {
      instrucciones();
      console.error('[mapas] no existe el extracto. Usa --descargar o --osm <archivo>.');
      process.exit(1);
    }
    await descargar(extracto);
  }

  const mbtiles = path.join(CARPETA, 'incidencias.mbtiles');
  const pmtiles = path.join(CARPETA, 'incidencias.pmtiles');
  if (existsSync(pmtiles) && !opciones.forzar) {
    console.log(`[mapas] ya existe ${pmtiles} (usa --forzar para regenerarlo).`);
    return;
  }

  // tilemaker trae ejemplos de configuración; se puede indicar otro con --config.
  const config = opciones.config
    ? path.resolve(opciones.config)
    : path.join(RAIZ, 'scripts', 'tilemaker-config.json');
  if (!existsSync(config)) {
    console.error(
      '[mapas] falta la configuración de tilemaker. Pásala con --config <archivo.json> ' +
        '(puedes partir de resources/config-example.json de tilemaker).'
    );
    process.exit(1);
  }

  const proceso = opciones.proceso
    ? path.resolve(opciones.proceso)
    : path.join(RAIZ, 'scripts', 'process-openmaptiles.lua');

  ejecutar('tilemaker', [
    `--input=${extracto}`,
    `--output=${mbtiles}`,
    `--config=${config}`,
    ...(existsSync(proceso) ? [`--process=${proceso}`] : [])
  ]);
  ejecutar('pmtiles', ['convert', mbtiles, pmtiles]);

  const tamano = (statSync(pmtiles).size / (1024 * 1024)).toFixed(1);
  console.log(`[mapas] listo: ${pmtiles} (${tamano} MB)`);
  console.log('[mapas] recuerda mantener la atribución a OpenStreetMap (ODbL).');
  console.log(`[mapas] archivos en ${CARPETA}: ${readdirSync(CARPETA).join(', ')}`);
}

principal().catch((error) => {
  console.error('[mapas] error:', error.message);
  process.exit(1);
});
