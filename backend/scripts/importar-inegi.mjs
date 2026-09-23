#!/usr/bin/env node
/**
 * IMPORTADOR DEL MARCO GEOESTADÍSTICO DEL INEGI
 *
 * Genera el catálogo geográfico de la aplicación (municipios y sus localidades)
 * a partir de los GeoJSON del INEGI publicados como `AGEM_<estado>.geojson`
 * (municipios) y `AGLOC_<cvegeo>.geojson` (localidades o comunidades).
 *
 * Los polígonos vienen en coordenadas geográficas [lng, lat] y con 8 decimales;
 * aquí se convierten a [lat, lng] (el formato que usa Leaflet y la geocerca),
 * se simplifican con Douglas-Peucker y se redondean a 5 decimales (~1 m) para
 * que el catálogo quepa en el repositorio.
 *
 * Uso:
 *   node scripts/importar-inegi.mjs                       # Michoacán completo (113)
 *   node scripts/importar-inegi.mjs --municipios=16050,16053
 *   node scripts/importar-inegi.mjs --estado=15           # otro estado
 *   node scripts/importar-inegi.mjs --tolerancia-zona=0   # sin simplificar
 *
 * Fuente por defecto: espejo en GitHub de los datos del INEGI
 * (MacWilliXD/INEGI-geojson). Se puede apuntar a otra con --base=<url>, por
 * ejemplo al servicio del propio INEGI si se publica la capa con geometría.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { areaDeAnillo, centroDePoligono, simplificarAnillo } from '../src/utils/geometria.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');

const FUENTE_POR_DEFECTO =
  'https://raw.githubusercontent.com/MacWilliXD/INEGI-geojson/main/geojson_descargas';

/** Nombres oficiales abreviados de las 32 entidades federativas. */
const ESTADOS = {
  '01': 'Aguascalientes',
  '02': 'Baja California',
  '03': 'Baja California Sur',
  '04': 'Campeche',
  '05': 'Coahuila',
  '06': 'Colima',
  '07': 'Chiapas',
  '08': 'Chihuahua',
  '09': 'Ciudad de México',
  10: 'Durango',
  11: 'Guanajuato',
  12: 'Guerrero',
  13: 'Hidalgo',
  14: 'Jalisco',
  15: 'México',
  16: 'Michoacán',
  17: 'Morelos',
  18: 'Nayarit',
  19: 'Nuevo León',
  20: 'Oaxaca',
  21: 'Puebla',
  22: 'Querétaro',
  23: 'Quintana Roo',
  24: 'San Luis Potosí',
  25: 'Sinaloa',
  26: 'Sonora',
  27: 'Tabasco',
  28: 'Tamaulipas',
  29: 'Tlaxcala',
  30: 'Veracruz',
  31: 'Yucatán',
  32: 'Zacatecas'
};

/** Paleta para pintar las comunidades (se repite en orden). */
const PALETA = [
  '#2563eb',
  '#16a34a',
  '#db2777',
  '#f59e0b',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#65a30d',
  '#c026d3',
  '#0d9488',
  '#ea580c',
  '#4f46e5'
];

/** Ancho aproximado (px) que ocupa el mapa en pantalla, para calcular el zoom. */
const ANCHO_UTIL_PX = 900;

/* ------------------------------- argumentos ------------------------------- */

function leerArgumentos(argumentos) {
  const opciones = {
    estado: '16',
    municipios: 'todos',
    base: FUENTE_POR_DEFECTO,
    cache: path.join(RAIZ, '.cache-inegi'),
    salida: path.join(RAIZ, 'src', 'config', 'seed-data'),
    toleranciaMunicipio: 0.0002,
    toleranciaZona: 0.0001,
    minAreaAnillo: 1e-10,
    decimales: 5,
    minPoblacion: 0
  };

  const numericas = {
    'tolerancia-municipio': 'toleranciaMunicipio',
    'tolerancia-zona': 'toleranciaZona',
    'min-area-anillo': 'minAreaAnillo',
    decimales: 'decimales',
    'min-poblacion': 'minPoblacion'
  };

  for (const argumento of argumentos) {
    const [crudo, valor] = argumento.replace(/^--/, '').split('=');
    const clave = crudo.trim();
    if (clave === 'ayuda' || clave === 'help') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
      process.exit(0);
    }
    if (clave === 'estado') opciones.estado = String(valor).padStart(2, '0');
    else if (clave === 'municipios') opciones.municipios = valor;
    else if (clave === 'base') opciones.base = valor.replace(/\/$/, '');
    else if (clave === 'cache') opciones.cache = path.resolve(valor);
    else if (clave === 'salida') opciones.salida = path.resolve(valor);
    else if (numericas[clave]) opciones[numericas[clave]] = Number(valor);
    else {
      console.error(`Opción desconocida: ${argumento}`);
      process.exit(1);
    }
  }

  return opciones;
}

const opciones = leerArgumentos(process.argv.slice(2));

/* --------------------------------- descarga -------------------------------- */

/** Descarga (o reutiliza de la caché) un GeoJSON de la fuente configurada. */
async function traer(archivo) {
  fs.mkdirSync(opciones.cache, { recursive: true });
  const destino = path.join(opciones.cache, archivo);
  if (fs.existsSync(destino) && fs.statSync(destino).size > 0) {
    return JSON.parse(fs.readFileSync(destino, 'utf8'));
  }
  const url = `${opciones.base}/${archivo}`;
  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    throw new Error(`No se pudo descargar ${url} (HTTP ${respuesta.status})`);
  }
  const texto = await respuesta.text();
  fs.writeFileSync(destino, texto);
  return JSON.parse(texto);
}

/* ------------------------------- conversión -------------------------------- */

/** Nombre legible: el INEGI trae espacios dobles y sobrantes. */
const limpiarNombre = (texto) =>
  String(texto || '')
    .replace(/\s+/g, ' ')
    .trim();

/** Redondea una coordenada para recortar el tamaño del catálogo. */
const redondear = (valor) => Number(Number(valor).toFixed(opciones.decimales));

/**
 * Convierte una geometría GeoJSON ([lng, lat], MultiPolygon) al formato de la
 * aplicación: anillo único `[[lat,lng], …]` o multipolígono `[[[lat,lng], …]]`.
 */
function aPoligono(geometria, tolerancia) {
  const partes =
    geometria?.type === 'Polygon'
      ? [geometria.coordinates]
      : geometria?.type === 'MultiPolygon'
        ? geometria.coordinates
        : [];

  const anillos = [];
  for (const parte of partes) {
    // Solo el contorno exterior de cada parte (el INEGI no publica huecos).
    const contorno = parte?.[0];
    if (!Array.isArray(contorno) || contorno.length < 3) continue;

    const comoLatLng = contorno.map(([lng, lat]) => [Number(lat), Number(lng)]);
    const simplificado = simplificarAnillo(comoLatLng, toleranciaDe(comoLatLng, tolerancia))
      .map(([lat, lng]) => [redondear(lat), redondear(lng)]);

    // Un anillo sin área apreciable (islas de unos metros) solo estorba.
    const area = areaDeAnillo(simplificado);
    if (area < opciones.minAreaAnillo && anillos.length > 0) continue;

    anillos.push(simplificado);
  }

  if (!anillos.length) return null;
  // Un solo anillo se guarda plano; con varios, como multipolígono.
  return anillos.length === 1 ? anillos[0] : anillos;
}

/**
 * Nivel de zoom con el que el municipio entra completo en la pantalla.
 * Se calcula igual que una capa de teselas: a zoom z, el mundo completo mide
 * 256·2^z píxeles, así que un hueco útil de ~900 px abarca
 * 360·900/(256·2^z) grados.
 */
function zoomDe(poligono) {
  const anillos = Array.isArray(poligono[0][0]) ? poligono : [poligono];
  const lats = anillos.flat().map((v) => v[0]);
  const lngs = anillos.flat().map((v) => v[1]);
  const alto = Math.max(...lats) - Math.min(...lats);
  const ancho = Math.max(...lngs) - Math.min(...lngs);
  const extension = Math.max(alto, ancho, 0.002);
  const zoom = Math.round(Math.log2((360 * ANCHO_UTIL_PX) / (256 * extension)));
  return Math.max(9, Math.min(14, zoom));
}

/**
 * Tolerancia efectiva de un anillo. Una comunidad de dos manzanas se deforma
 * con la tolerancia de un municipio entero, así que se escala con su tamaño:
 * ~1.5 % de su extensión, con un mínimo de 5 m y el máximo indicado (22 m).
 */
function toleranciaDe(anillo, maxima) {
  if (!(maxima > 0)) return 0;
  const lats = anillo.map((v) => v[0]);
  const lngs = anillo.map((v) => v[1]);
  const extension = Math.max(
    Math.max(...lats) - Math.min(...lats),
    Math.max(...lngs) - Math.min(...lngs)
  );
  return Math.min(maxima, Math.max(0.00005, extension * 0.015));
}

/** Convierte las localidades de un municipio en zonas de la aplicación. */
function aZonas(municipio, coleccion) {
  const zonas = [];
  for (const feature of coleccion.features || []) {
    const props = feature.properties || {};
    const poligono = aPoligono(feature.geometry, opciones.toleranciaZona);
    if (!poligono) continue;

    const poblacion = Number(props.pob) || 0;
    if (poblacion < opciones.minPoblacion) continue;

    zonas.push({
      id: `loc_${props.cvegeo || `${municipio.cvegeo}${props.cve_loc}`}`,
      nombre: limpiarNombre(props.nom_loc) || 'Localidad sin nombre',
      tipo: 'localidad',
      ambito: (props.ambito || '').toLowerCase() === 'urbano' ? 'urbano' : 'rural',
      clave: String(props.cvegeo || ''),
      poblacion,
      poligono
    });
  }

  // Primero las comunidades con más gente (la cabecera municipal al frente) y
  // hasta el final los colores: si se pintan antes de ordenar, dos comunidades
  // contiguas de la lista acaban con el mismo color.
  return zonas
    .sort((a, b) => b.poblacion - a.poblacion || a.nombre.localeCompare(b.nombre, 'es'))
    .map((zona, indice) => ({ ...zona, color: PALETA[indice % PALETA.length] }));
}

/* ------------------------------- serialización ----------------------------- */

/**
 * Escribe el JSON con sangría legible, pero dejando cada polígono en una sola
 * línea: si no, cada coordenada ocuparía un renglón y el catálogo se duplicaría
 * de tamaño sin ganar nada.
 */
function escribirJsonCompacto(ruta, datos) {
  const poligonos = [];
  const reemplazo = (clave, valor) => {
    if (clave === 'poligono' && Array.isArray(valor)) {
      poligonos.push(JSON.stringify(valor));
      return `@@POLIGONO_${poligonos.length - 1}@@`;
    }
    return valor;
  };

  const texto = JSON.stringify(datos, reemplazo, 2).replace(
    /"@@POLIGONO_(\d+)@@"/g,
    (_, indice) => poligonos[Number(indice)]
  );

  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, `${texto}\n`);
  return fs.statSync(ruta).size;
}

/* --------------------------------- principal ------------------------------- */

const nombreEstado = ESTADOS[opciones.estado] || `Estado ${opciones.estado}`;

console.log(`Estado: ${opciones.estado} (${nombreEstado})`);
console.log(`Fuente: ${opciones.base}`);

const agem = await traer(`AGEM_${opciones.estado}.geojson`);
const disponibles = (agem.features || []).filter((f) => f.geometry);
const seleccion =
  opciones.municipios === 'todos'
    ? disponibles
    : disponibles.filter((f) =>
        opciones.municipios
          .split(',')
          .map((s) => s.trim().padStart(opciones.estado.length === 2 ? 5 : 5, '0'))
          .includes(String(f.properties.cvegeo))
      );

if (!seleccion.length) {
  console.error('No se seleccionó ningún municipio. Revisa --municipios.');
  process.exit(1);
}

console.log(`Municipios con geometría: ${disponibles.length} · a importar: ${seleccion.length}`);

const municipios = [];
const zonasPorMunicipio = {};
let zonasTotales = 0;
let verticesTotales = 0;
const sinLocalidades = [];

for (const [indice, feature] of seleccion.entries()) {
  const props = feature.properties || {};
  const cvegeo = String(props.cvegeo);
  const nombre = limpiarNombre(props.nom_agem) || `Municipio ${cvegeo}`;
  const poligono = aPoligono(feature.geometry, opciones.toleranciaMunicipio);
  if (!poligono) {
    console.warn(`  ! ${nombre} (${cvegeo}): geometría no aprovechable, se omite`);
    continue;
  }

  let zonas = [];
  try {
    const agloc = await traer(`AGLOC_${cvegeo}.geojson`);
    zonas = aZonas({ cvegeo }, agloc);
  } catch (error) {
    console.warn(`  ! ${nombre} (${cvegeo}): sin localidades (${error.message})`);
  }

  // Municipio sin localidades: se usa el propio municipio como única zona para
  // que se puedan seguir recibiendo reportes.
  if (!zonas.length) {
    sinLocalidades.push(nombre);
    zonas = [
      {
        id: `mun_${cvegeo}`,
        nombre: `${nombre} (todo el municipio)`,
        tipo: 'municipio',
        ambito: 'rural',
        clave: cvegeo,
        poblacion: Number(props.pob) || 0,
        color: PALETA[0],
        poligono
      }
    ];
  }

  municipios.push({
    id: cvegeo,
    nombre,
    estado: nombreEstado,
    clave: cvegeo,
    poblacion: Number(props.pob) || 0,
    cabecera: zonas[0]?.nombre || null,
    center: centroDePoligono(poligono).map(redondear),
    zoom: zoomDe(poligono),
    poligono
  });

  zonasPorMunicipio[cvegeo] = zonas;
  zonasTotales += zonas.length;
  verticesTotales +=
    (Array.isArray(poligono[0][0]) ? poligono.flat() : poligono).length +
    zonas.reduce(
      (suma, z) => suma + (Array.isArray(z.poligono[0][0]) ? z.poligono.flat() : z.poligono).length,
      0
    );

  if ((indice + 1) % 20 === 0) {
    console.log(`  … ${indice + 1}/${seleccion.length} municipios procesados`);
  }
}

municipios.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

const bytesMunicipios = escribirJsonCompacto(
  path.join(opciones.salida, 'municipios.json'),
  municipios
);
const bytesZonas = escribirJsonCompacto(path.join(opciones.salida, 'zonas.json'), zonasPorMunicipio);

const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;
console.log('');
console.log(`Municipios: ${municipios.length}`);
console.log(`Comunidades (localidades): ${zonasTotales}`);
console.log(`Vértices totales: ${verticesTotales.toLocaleString('es-MX')}`);
console.log(`municipios.json: ${mb(bytesMunicipios)} · zonas.json: ${mb(bytesZonas)}`);
if (sinLocalidades.length) {
  console.log(`Sin localidades (se usó el municipio completo): ${sinLocalidades.join(', ')}`);
}
console.log(`Escrito en ${opciones.salida}`);
