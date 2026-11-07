#!/usr/bin/env node
/**
 * IMPORTADOR DE VIALIDADES REALES
 *
 * Carga el trazado de calles y carreteras de un municipio en la tabla
 * `vialidades` para que la capa de condición use geometrías reales.
 *
 * Uso:
 *   npm run importar-vialidades -- --municipio=16050
 *   npm run importar-vialidades -- --municipio=16050 --archivo=calles.geojson
 *   npm run importar-vialidades -- --municipio=16050 --radio=8000 --limite=3000
 *
 * Sin `--archivo` consulta OpenStreetMap (Overpass). El GeoJSON de entrada
 * puede ser un FeatureCollection o un arreglo de elementos `way` de Overpass.
 * Las coordenadas se guardan como GeoJSON LineString [lng, lat].
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { obtenerRepositorio, cerrarRepositorio } from '../src/repositories/index.js';
import { claveDeVia } from '../src/services/vialidades.service.js';
import {
  importarDesdeOsm,
  prepararViaImportada,
  viasDesdeContenido
} from '../src/services/vialidades-import.service.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

function argumentos() {
  const salida = {};
  for (const argumento of process.argv.slice(2)) {
    const [clave, valor] = argumento.replace(/^--/, '').split('=');
    salida[clave] = valor ?? '1';
  }
  return salida;
}

function leerArchivo(ruta) {
  const completa = path.isAbsolute(ruta) ? ruta : path.resolve(AQUI, '..', ruta);
  return fs.readFileSync(completa, 'utf8');
}

function desdeFeatureCollection(datos) {
  const features = Array.isArray(datos?.features) ? datos.features : Array.isArray(datos) ? datos : [];
  const vias = [];
  for (const feature of features) {
    const geometria = feature?.geometry || feature;
    const tipo = String(geometria?.type || '');
    if (!['LineString', 'MultiLineString'].includes(tipo)) continue;
    const lineas =
      tipo === 'LineString' ? [geometria.coordinates] : geometria.coordinates.filter(Array.isArray);
    lineas.forEach((coordenadas, indice) => {
      if (!Array.isArray(coordenadas) || coordenadas.length < 2) return;
      const nombre = String(feature?.properties?.name || feature?.properties?.nombre || '').slice(0, 160);
      const clase = String(feature?.properties?.highway || feature?.properties?.tipo || 'calle').slice(0, 40);
      const id = String(feature?.id || `${indice}`);
      vias.push({
        id: `geo-${id}-${indice}`.slice(0, 64),
        nombre,
        clave: claveDeVia(nombre) || `VIA-${id}`,
        tipo: clase,
        geometria: { type: 'LineString', coordinates: coordenadas.map(([lng, lat]) => [Number(lng), Number(lat)]) },
        propiedades: feature?.properties || {},
        osmId: String(feature?.id || '').slice(0, 64) || null,
        fuente: 'geojson'
      });
    });
  }
  return vias;
}

function desdeOverpass(datos) {
  const elementos = Array.isArray(datos?.elements) ? datos.elements : [];
  return elementos
    .filter((elemento) => elemento?.type === 'way' && Array.isArray(elemento.geometry))
    .map((elemento) => {
      const nombre = String(elemento.tags?.name || '').slice(0, 160);
      return {
        id: `osm-${elemento.id}`.slice(0, 64),
        nombre,
        clave: claveDeVia(nombre) || `OSM-${elemento.id}`,
        tipo: String(elemento.tags?.highway || 'calle').slice(0, 40),
        geometria: {
          type: 'LineString',
          coordinates: elemento.geometry.map((punto) => [Number(punto.lon), Number(punto.lat)])
        },
        propiedades: elemento.tags || {},
        osmId: `osm-${elemento.id}`.slice(0, 64),
        fuente: 'openstreetmap'
      };
    });
}

async function consultarOverpass(municipio, radio) {
  const lat = Number(municipio.center?.lat ?? municipio.centerLat);
  const lng = Number(municipio.center?.lng ?? municipio.centerLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('El municipio no tiene centro geográfico para consultar OpenStreetMap');
  }
  const consulta = `[out:json][timeout:60];way["highway"](around:${radio},${lat},${lng});out geom;`;
  const respuesta = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: consulta })
  });
  if (!respuesta.ok) {
    throw new Error(`OpenStreetMap respondió ${respuesta.status}; usa --archivo=<geojson>`);
  }
  return respuesta.json();
}

async function principal() {
  const opciones = argumentos();
  const municipioId = opciones.municipio;
  if (!municipioId) {
    console.error('Falta --municipio=<id>. Ejemplo: npm run importar-vialidades -- --municipio=16050');
    process.exitCode = 1;
    return;
  }
  const repositorio = await obtenerRepositorio();
  const municipio = await repositorio.municipioPorId(municipioId);
  if (!municipio) {
    console.error(`No existe el municipio ${municipioId}`);
    process.exitCode = 1;
    return;
  }

  const limite = Math.min(Number(opciones.limite) || 2500, 5000);
  let vias;
  if (opciones.archivo) {
    console.log(`Leyendo ${opciones.archivo}…`);
    vias = viasDesdeContenido(leerArchivo(opciones.archivo), { municipioId, limite });
  } else {
    console.log(`Consultando OpenStreetMap alrededor de ${municipio.nombre}…`);
    vias = await importarDesdeOsm(municipio, {
      radio: Number(opciones.radio) || 10000,
      limite
    });
  }
  if (!vias.length) {
    console.error('No se encontraron vialidades válidas para importar.');
    process.exitCode = 1;
    return;
  }
  const resultado = await repositorio.sincronizarVialidades(municipioId, vias, {
    reemplazar: opciones.reemplazar === '1' || opciones.reemplazar === 'true'
  });
  console.log(
    `${resultado.total} vialidad(es) procesadas en ${municipio.nombre} (${municipioId}): ${resultado.creadas} creadas, ${resultado.actualizadas} actualizadas.`
  );
}

principal()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => cerrarRepositorio());
