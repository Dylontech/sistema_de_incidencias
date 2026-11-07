/**
 * Importación de red vial desde KML/GeoJSON/OpenStreetMap.
 *
 * Regla central: nunca se guarda una unión de incidencias. Si la fuente trae
 * un eje, se convierte en corredor poligonal; si trae un polígono, se respeta.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import {
  anchoDePropiedades,
  bboxDeGeometria,
  bufferizarEje,
  claveDeVia,
  esGeometriaLinea,
  esGeometriaPoligono,
  esViaVehicularOsm,
  normalizarGeometria,
  tipoDeViaOsm
} from './geometria.service.js';

const MAXIMO_IMPORTACION = 5000;
const TIPOS = new Set([
  'calle',
  'avenida',
  'camino_rural',
  'carretera_estatal',
  'carretera_federal',
  'autopista',
  'otra'
]);

function decodificarXml(valor) {
  return String(valor || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function nombreDe(valor, respaldo = '') {
  return decodificarXml(valor).replace(/\s+/g, ' ').trim().slice(0, 160) || respaldo;
}

function tipoPorNombre(nombre) {
  const texto = String(nombre || '').toLowerCase();
  if (/autopista|supercarretera|libramiento/.test(texto)) return 'autopista';
  if (/carretera federal|mex-|mexico-/.test(texto)) return 'carretera_federal';
  if (/carretera|estatal/.test(texto)) return 'carretera_estatal';
  if (/camino|brecha|terracer[ií]a/.test(texto)) return 'camino_rural';
  if (/avenida|av\.|bulevar|blvd|paseo|calzada/.test(texto)) return 'avenida';
  return 'calle';
}

function tipoValido(valor, nombre = '') {
  const clave = String(valor || '').trim();
  if (TIPOS.has(clave)) return clave;
  const desdeOsm = tipoDeViaOsm(clave);
  return desdeOsm === 'otra' ? tipoPorNombre(nombre) : desdeOsm;
}

function coordenadasKml(texto) {
  return String(texto || '')
    .trim()
    .split(/\s+/)
    .map((par) => par.split(',').slice(0, 2).map(Number))
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
}

function bloques(xml, etiqueta) {
  return [...String(xml || '').matchAll(new RegExp(`<${etiqueta}[^>]*>([\\s\\S]*?)</${etiqueta}>`, 'gi'))];
}

function coordenadaDeBloque(bloque) {
  const match = String(bloque).match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i);
  return match ? coordenadasKml(match[1]) : [];
}

function viasKml(contenido) {
  const placemarks = bloques(contenido, 'Placemark');
  const vias = [];
  for (const placemark of placemarks) {
    const cuerpo = placemark[1];
    const nombre = nombreDe(cuerpo.match(/<name[^>]*>([\s\S]*?)<\/name>/i)?.[1] || '');
    const poligonos = bloques(cuerpo, 'Polygon');
    for (const poligono of poligonos) {
      const anillos = [];
      const exterior = coordenadaDeBloque(poligono[1]);
      if (exterior.length >= 3) anillos.push(exterior);
      for (const hueco of bloques(poligono[1], 'innerBoundaryIs')) {
        const anillo = coordenadaDeBloque(hueco[1]);
        if (anillo.length >= 3) anillos.push(anillo);
      }
      if (anillos.length) {
        vias.push({
          nombre: nombre || 'Vialidad KML',
          geometria: { type: 'Polygon', coordinates: anillos },
          propiedades: {},
          fuente: 'google_maps'
        });
      }
    }
    const lineas = bloques(cuerpo, 'LineString');
    for (const linea of lineas) {
      const coordenadas = coordenadaDeBloque(linea[1]);
      if (coordenadas.length >= 2) {
        vias.push({
          nombre: nombre || 'Vialidad KML',
          geometria: { type: 'LineString', coordinates: coordenadas },
          propiedades: {},
          fuente: 'google_maps'
        });
      }
    }
    if (!poligonos.length && !lineas.length) {
      const coordenadas = coordenadaDeBloque(cuerpo);
      if (coordenadas.length >= 2) {
        vias.push({
          nombre: nombre || 'Vialidad KML',
          geometria: { type: 'LineString', coordinates: coordenadas },
          propiedades: {},
          fuente: 'google_maps'
        });
      }
    }
  }
  return vias;
}

function viasGeoJson(contenido) {
  let datos;
  try {
    datos = typeof contenido === 'string' ? JSON.parse(contenido) : contenido;
  } catch {
    throw AppError.solicitudInvalida('El archivo no es un GeoJSON válido');
  }
  const features = Array.isArray(datos?.features)
    ? datos.features
    : Array.isArray(datos)
      ? datos
      : [datos];
  const vias = [];
  features.forEach((feature, indice) => {
    const geometriaCruda = feature?.geometry || feature;
    const geometria = normalizarGeometria(geometriaCruda);
    if (!geometria) return;
    const propiedades = feature?.properties || {};
    const nombre = String(propiedades.name || propiedades.nombre || '').slice(0, 160);
    const tipo = tipoValido(propiedades.highway || propiedades.tipo, nombre);
    const lineas = geometria.type === 'MultiLineString'
      ? geometria.coordinates.map((coordinates) => ({ type: 'LineString', coordinates }))
      : [geometria];
    lineas.forEach((cada, subindice) => {
      const osmId = String(feature?.id || propiedades.osm_id || '').slice(0, 64) || null;
      vias.push({
        nombre: nombre || `Vialidad importada ${indice + 1}${lineas.length > 1 ? `-${subindice + 1}` : ''}`,
        clave: claveDeVia(nombre),
        tipo,
        geometria: cada,
        propiedades,
        osmId: osmId && lineas.length > 1 ? `${osmId}-${subindice}`.slice(0, 64) : osmId,
        fuente: 'geojson'
      });
    });
  });
  return vias;
}

function viasOverpass(contenido) {
  const elementos = Array.isArray(contenido?.elements) ? contenido.elements : [];
  return elementos
    .filter((elemento) => elemento?.type === 'way' && Array.isArray(elemento.geometry))
    .filter((elemento) => esViaVehicularOsm(elemento.tags?.highway))
    .map((elemento) => {
      const nombre = String(elemento.tags?.name || elemento.tags?.ref || '').slice(0, 160);
      return {
        nombre,
        clave: claveDeVia(nombre),
        tipo: tipoValido(elemento.tags?.highway, nombre),
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

/**
 * Convierte una entrada cruda en una vialidad lista para persistir.
 * Devuelve `null` si la geometría queda vacía.
 */
export function prepararViaImportada(cruda, { municipioId, indice = 0 } = {}) {
  const geometria = normalizarGeometria(cruda.geometria);
  if (!geometria) return null;
  const nombre = String(cruda.nombre || '').trim().slice(0, 160) || `Vialidad importada ${indice + 1}`;
  const tipo = tipoValido(cruda.tipo, nombre);
  const fuente = String(cruda.fuente || 'geojson').slice(0, 120);
  const osmId = String(cruda.osmId || '').slice(0, 64) || null;
  const propiedades = cruda.propiedades || {};
  const anchoM = anchoDePropiedades(tipo, propiedades);
  let eje = null;
  let geometriaFinal = geometria;
  let geometriaTipo = geometria.type === 'Polygon' ? 'poligono' : 'multipoligono';
  if (esGeometriaLinea(geometria)) {
    const buffer = bufferizarEje(geometria, anchoM, { segmentos: false, soloVertices: true });
    if (!buffer) return null;
    eje = geometria;
    geometriaFinal = buffer.geometria;
    geometriaTipo = 'poligono_generado';
  } else if (esGeometriaPoligono(geometria)) {
    const ejeCrudo = normalizarGeometria(cruda.eje);
    eje = ejeCrudo && esGeometriaLinea(ejeCrudo) ? ejeCrudo : null;
    geometriaTipo = geometria.type === 'MultiPolygon' ? 'multipoligono' : 'poligono';
  }
  return {
    id: `via-${nuevoId()}`,
    municipioId,
    nombre,
    clave: String(cruda.clave || claveDeVia(nombre) || `VIA-${indice + 1}`).slice(0, 160),
    tipo,
    geometria: geometriaFinal,
    eje,
    anchoM,
    bbox: bboxDeGeometria(geometriaFinal),
    geometriaTipo,
    osmId,
    fuente,
    googleMapsUrl: '',
    notas: '',
    verificadaEn: null,
    verificadaPor: null,
    activo: true,
    actualizadoEn: new Date().toISOString()
  };
}

/** Detecta KML, GeoJSON o Overpass y devuelve vialidades preparadas. */
export function viasDesdeContenido(contenido, { municipioId, limite = MAXIMO_IMPORTACION } = {}) {
  const texto =
    typeof contenido === 'string'
      ? contenido.replace(/^\uFEFF/, '').trim()
      : JSON.stringify(contenido || null);
  if (!texto || texto === 'null') throw AppError.solicitudInvalida('El archivo está vacío');
  const crudas = texto.startsWith('<')
    ? viasKml(texto)
    : (() => {
        let datos;
        try {
          datos = JSON.parse(texto);
        } catch {
          throw AppError.solicitudInvalida('El archivo no es un KML ni un GeoJSON válido');
        }
        return Array.isArray(datos?.elements) ? viasOverpass(datos) : viasGeoJson(datos);
      })();
  const maximo = Math.min(Math.max(Number(limite) || MAXIMO_IMPORTACION, 1), MAXIMO_IMPORTACION);
  return crudas
    .slice(0, maximo)
    .map((cruda, indice) => prepararViaImportada(cruda, { municipioId, indice }))
    .filter(Boolean);
}

/** Descarga la red vehicular real de OpenStreetMap para un municipio. */
export async function importarDesdeOsm(municipio, { radio = 6000, limite = MAXIMO_IMPORTACION } = {}) {
  const centro = Array.isArray(municipio?.center)
    ? { lat: Number(municipio.center[0]), lng: Number(municipio.center[1]) }
    : {
        lat: Number(municipio?.center?.lat ?? municipio?.centerLat),
        lng: Number(municipio?.center?.lng ?? municipio?.centerLng)
      };
  const poligonoMunicipio = Array.isArray(municipio?.poligono) ? municipio.poligono : [];
  const limiteOsm = Math.min(Math.max(Number(limite) || 2500, 1), 2500);
  const expresion =
    '["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|track|road)(_link)?$"]';
  let consulta;
  // El radio es más rápido y estable que un bbox municipal enorme en Overpass.
  // Si el municipio no tiene centro, se usa la caja de su polígono.
  if (Number.isFinite(centro.lat) && Number.isFinite(centro.lng)) {
    const metros = Math.min(Math.max(Number(radio) || 10000, 1000), 25000);
    consulta = `[out:json][timeout:90];way${expresion}(around:${metros},${centro.lat},${centro.lng});out geom ${limiteOsm};`;
  } else if (poligonoMunicipio.length) {
    let sur = Infinity;
    let oeste = Infinity;
    let norte = -Infinity;
    let este = -Infinity;
    for (const [lat, lng] of poligonoMunicipio) {
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) continue;
      sur = Math.min(sur, Number(lat));
      norte = Math.max(norte, Number(lat));
      oeste = Math.min(oeste, Number(lng));
      este = Math.max(este, Number(lng));
    }
    if (Number.isFinite(sur) && Number.isFinite(oeste) && sur < norte && oeste < este) {
      consulta = `[out:json][timeout:90];way${expresion}(${sur},${oeste},${norte},${este});out geom ${limiteOsm};`;
    }
  }
  if (!consulta) {
    throw AppError.solicitudInvalida('El municipio no tiene centro geográfico para consultar OSM');
  }
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  let ultimoEstado = null;
  for (const endpoint of endpoints) {
    try {
      const respuesta = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'SistemaIncidenciasMunicipales/2.17 (soporte local)'
        },
        body: new URLSearchParams({ data: consulta }),
        signal: AbortSignal.timeout(95000)
      });
      if (respuesta.ok) {
        return viasDesdeContenido(await respuesta.json(), {
          municipioId: municipio.id,
          limite: limiteOsm
        });
      }
      ultimoEstado = respuesta.status;
    } catch {
      ultimoEstado = 'sin conexión';
    }
  }
  throw new AppError(
    502,
    `OpenStreetMap no respondió (${ultimoEstado || 'sin conexión'}). Importa un KML/GeoJSON local.`
  );
}
