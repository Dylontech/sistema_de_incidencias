/**
 * Geometría vial: normalización, corredores poligonales y distancias.
 *
 * Las vialidades se guardan como GeoJSON `[lng, lat]`. Un eje lineal se
 * convierte en un polígono de calzada para que el mapa no dependa de una
 * línea delgada (ni de un punteado heurístico) y para poder colorear
 * subtramos con el semáforo de condición.
 */

const TIPOS_LINEA = new Set(['LineString', 'MultiLineString']);
const TIPOS_POLIGONO = new Set(['Polygon', 'MultiPolygon']);

export const ANCHOS_VIA = {
  calle: 8,
  avenida: 14,
  camino_rural: 6,
  carretera_estatal: 12,
  carretera_federal: 18,
  autopista: 24,
  otra: 8
};

/** Normaliza un nombre de vía para agrupar «Av. Juárez» y «AV JUAREZ». */
export function claveDeVia(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function coordenada(valor) {
  if (!Array.isArray(valor) || valor.length < 2) return null;
  const lng = numero(valor[0]);
  const lat = numero(valor[1]);
  if (lng === null || lat === null) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

function linea(valor) {
  if (!Array.isArray(valor)) return [];
  return valor.map(coordenada).filter(Boolean);
}

function anillo(valor) {
  const puntos = linea(valor);
  if (!puntos.length) return [];
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) puntos.push([...primero]);
  return puntos.length >= 4 ? puntos : [];
}

function poligono(valor) {
  if (!Array.isArray(valor)) return [];
  return valor.map(anillo).filter((ring) => ring.length >= 4);
}

/**
 * Devuelve una geometría GeoJSON válida o `null`. Acepta también arreglos de
 * pares antiguos, que se interpretan como `LineString`.
 */
export function normalizarGeometria(valor) {
  let crudo = valor;
  if (typeof crudo === 'string') {
    try {
      crudo = JSON.parse(crudo);
    } catch {
      return null;
    }
  }
  if (crudo?.type === 'Feature') crudo = crudo.geometry;
  if (!crudo) return null;
  if (Array.isArray(crudo)) {
    if (Array.isArray(crudo[0]) && Array.isArray(crudo[0][0])) {
      const lineas = crudo.map(linea).filter((item) => item.length >= 2);
      return lineas.length ? { type: 'MultiLineString', coordinates: lineas } : null;
    }
    const puntos = linea(crudo);
    return puntos.length >= 2 ? { type: 'LineString', coordinates: puntos } : null;
  }
  if (typeof crudo !== 'object') return null;
  const tipo = String(crudo.type || '').trim();
  if (!tipo && Array.isArray(crudo.coordinates)) {
    return normalizarGeometria(crudo.coordinates);
  }
  if (tipo === 'LineString') {
    const puntos = linea(crudo.coordinates);
    return puntos.length >= 2 ? { type: tipo, coordinates: puntos } : null;
  }
  if (tipo === 'MultiLineString') {
    const lineas = (Array.isArray(crudo.coordinates) ? crudo.coordinates : [])
      .map(linea)
      .filter((item) => item.length >= 2);
    return lineas.length ? { type: tipo, coordinates: lineas } : null;
  }
  if (tipo === 'Polygon') {
    const anillos = poligono(crudo.coordinates);
    return anillos.length ? { type: tipo, coordinates: anillos } : null;
  }
  if (tipo === 'MultiPolygon') {
    const poligonos = (Array.isArray(crudo.coordinates) ? crudo.coordinates : [])
      .map(poligono)
      .filter((anillos) => anillos.length);
    return poligonos.length ? { type: tipo, coordinates: poligonos } : null;
  }
  return null;
}

export function esGeometriaLinea(geometria) {
  return Boolean(geometria && TIPOS_LINEA.has(geometria.type));
}

export function esGeometriaPoligono(geometria) {
  return Boolean(geometria && TIPOS_POLIGONO.has(geometria.type));
}

/** Todas las líneas y anillos de una geometría. */
export function lineasDeGeometria(geometria) {
  if (!geometria) return [];
  if (geometria.type === 'LineString') return [geometria.coordinates];
  if (geometria.type === 'MultiLineString') return geometria.coordinates;
  if (geometria.type === 'Polygon') return geometria.coordinates;
  if (geometria.type === 'MultiPolygon') return geometria.coordinates.flat();
  return [];
}

export function poligonosDeGeometria(geometria) {
  if (!geometria) return [];
  if (geometria.type === 'Polygon') return [geometria.coordinates];
  if (geometria.type === 'MultiPolygon') return geometria.coordinates;
  return [];
}

export function bboxDeGeometria(geometria) {
  const coordenadas = lineasDeGeometria(geometria).flat();
  if (!coordenadas.length) return null;
  return coordenadas.reduce(
    (caja, [lng, lat]) => [
      Math.min(caja[0], lng),
      Math.min(caja[1], lat),
      Math.max(caja[2], lng),
      Math.max(caja[3], lat)
    ],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
}

export function bboxIntersecta(a, b) {
  if (!a || !b) return true;
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

function aMetros(lat, lng, referencia) {
  const rad = (referencia.lat * Math.PI) / 180;
  return {
    x: (lng - referencia.lng) * 111320 * Math.cos(rad),
    y: (lat - referencia.lat) * 110540
  };
}

function desdeMetros(x, y, referencia) {
  const rad = (referencia.lat * Math.PI) / 180;
  return {
    lng: referencia.lng + x / (111320 * Math.cos(rad)),
    lat: referencia.lat + y / 110540
  };
}

function referenciaDe(linea) {
  return { lat: linea[0][1], lng: linea[0][0] };
}

function distanciaPuntoSegmento(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const largo = dx * dx + dy * dy;
  const t = largo ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo)) : 0;
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return Math.hypot(p.x - x, p.y - y);
}

export function distanciaPuntoALineaMetros(punto, linea) {
  if (!linea?.length) return Infinity;
  const lat = Number(punto.lat);
  const lng = Number(punto.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Infinity;
  const referencia = referenciaDe(linea);
  const p = aMetros(lat, lng, referencia);
  const puntos = linea.map(([ln, lt]) => aMetros(lt, ln, referencia));
  let minimo = Infinity;
  for (let i = 0; i < puntos.length - 1; i += 1) {
    minimo = Math.min(minimo, distanciaPuntoSegmento(p, puntos[i], puntos[i + 1]));
  }
  if (puntos.length === 1) minimo = Math.hypot(p.x - puntos[0].x, p.y - puntos[0].y);
  return minimo;
}

/** Posición de un reporte sobre el eje: distancia y avance en metros. */
export function posicionEnLinea(punto, linea) {
  if (!linea?.length) return { distancia: Infinity, avance: 0 };
  const referencia = referenciaDe(linea);
  const p = aMetros(Number(punto.lat), Number(punto.lng), referencia);
  const puntos = linea.map(([lng, lat]) => aMetros(lat, lng, referencia));
  let acumulado = 0;
  let mejor = { distancia: Infinity, avance: 0 };
  for (let i = 0; i < puntos.length - 1; i += 1) {
    const a = puntos[i];
    const b = puntos[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const largo = Math.hypot(dx, dy);
    const t = largo
      ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (largo * largo)))
      : 0;
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    const distancia = Math.hypot(p.x - x, p.y - y);
    if (distancia < mejor.distancia) mejor = { distancia, avance: acumulado + t * largo };
    acumulado += largo;
  }
  if (puntos.length === 1) {
    mejor = {
      distancia: Math.hypot(p.x - puntos[0].x, p.y - puntos[0].y),
      avance: 0
    };
  }
  return mejor;
}

function puntoEnAnillo(lng, lat, anilloGeo) {
  let dentro = false;
  for (let i = 0, j = anilloGeo.length - 1; i < anilloGeo.length; j = i, i += 1) {
    const [xi, yi] = anilloGeo[i];
    const [xj, yj] = anilloGeo[j];
    const cruza = yi > lat !== yj > lat;
    if (cruza && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) {
      dentro = !dentro;
    }
  }
  return dentro;
}

export function puntoEnPoligono(punto, geometria) {
  const lng = Number(punto.lng);
  const lat = Number(punto.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  for (const anillos of poligonosDeGeometria(geometria)) {
    if (!anillos.length) continue;
    if (puntoEnAnillo(lng, lat, anillos[0])) {
      if (!anillos.slice(1).some((hueco) => puntoEnAnillo(lng, lat, hueco))) return true;
    }
  }
  return false;
}

export function distanciaPuntoAGeometriaMetros(punto, geometria) {
  if (!geometria) return Infinity;
  if (esGeometriaPoligono(geometria) && puntoEnPoligono(punto, geometria)) return 0;
  return lineasDeGeometria(geometria).reduce(
    (minimo, item) => Math.min(minimo, distanciaPuntoALineaMetros(punto, item)),
    Infinity
  );
}

function circuloPoligono(centro, radio) {
  const pasos = 10;
  const anillo = [];
  for (let i = 0; i < pasos; i += 1) {
    const angulo = (i / pasos) * Math.PI * 2;
    anillo.push([
      centro.lng + (Math.cos(angulo) * radio) / (111320 * Math.cos((centro.lat * Math.PI) / 180)),
      centro.lat + (Math.sin(angulo) * radio) / 110540
    ]);
  }
  anillo.push([...anillo[0]]);
  return { type: 'Polygon', coordinates: [anillo] };
}

function muestrasDeLinea(linea, anchoM, { soloVertices = false, paso = 24, maxMuestras = 500 } = {}) {
  const referencia = referenciaDe(linea);
  const puntos = linea.map(([lng, lat]) => aMetros(lat, lng, referencia));
  const acumulados = [0];
  for (let i = 1; i < puntos.length; i += 1) {
    acumulados.push(
      acumulados[i - 1] +
        Math.hypot(puntos[i].x - puntos[i - 1].x, puntos[i].y - puntos[i - 1].y)
    );
  }
  const total = acumulados.at(-1) || 0;
  if (total < 1) {
    const centro = { lat: linea[0][1], lng: linea[0][0] };
    return { total: 0, muestras: [{ centro, izquierda: null, derecha: null, avance: 0 }] };
  }
  const half = Math.max(1, Number(anchoM) || 8) / 2;
  const crearMuestra = (indice, avance) => {
    const a = puntos[indice - 1];
    const b = puntos[indice] || puntos[indice - 1];
    const largoSegmento = acumulados[indice] - acumulados[indice - 1] || 1;
    const t = Math.max(0, Math.min(1, (avance - acumulados[indice - 1]) / largoSegmento));
    const centro = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t
    };
    const antes = puntos[Math.max(0, indice - 2)] || a;
    const despues = puntos[Math.min(puntos.length - 1, indice + 1)] || b;
    const dx = despues.x - antes.x;
    const dy = despues.y - antes.y;
    const largo = Math.hypot(dx, dy) || 1;
    const nx = -dy / largo;
    const ny = dx / largo;
    return {
      centro: desdeMetros(centro.x, centro.y, referencia),
      izquierda: desdeMetros(centro.x + nx * half, centro.y + ny * half, referencia),
      derecha: desdeMetros(centro.x - nx * half, centro.y - ny * half, referencia),
      avance
    };
  };
  if (soloVertices) {
    return {
      total,
      muestras: puntos.map((_, indice) =>
        crearMuestra(Math.max(1, indice), acumulados[indice] || 0)
      )
    };
  }
  const cantidad = Math.max(2, Math.min(maxMuestras, Math.ceil(total / Math.max(5, paso))));
  const muestras = [];
  for (let i = 0; i <= cantidad; i += 1) {
    const avance = (total * i) / cantidad;
    let indice = 1;
    while (indice < acumulados.length && acumulados[indice] < avance) indice += 1;
    if (indice >= acumulados.length) indice = acumulados.length - 1;
    muestras.push(crearMuestra(indice, avance));
  }
  return { total, muestras };
}

/**
 * Convierte un eje en un corredor poligonal y, si se piden, en subtramos para
 * el degradado. `soloVertices` evita muestrear cada 24 m al importar miles de
 * calles; el render de condición vuelve a muestrear sólo las vías con datos.
 */
export function bufferizarEje(
  eje,
  anchoM,
  { segmentos = true, soloVertices = false, paso = 24, maxMuestras = 500 } = {}
) {
  const geometria = normalizarGeometria(eje);
  const linea = geometria?.type === 'LineString'
    ? geometria.coordinates
    : geometria?.type === 'MultiLineString'
      ? geometria.coordinates[0]
      : null;
  if (!linea?.length) return null;
  if (linea.length === 1) {
    const poligonoUnico = circuloPoligono(
      { lat: linea[0][1], lng: linea[0][0] },
      (Number(anchoM) || 8) / 2
    );
    return {
      geometria: poligonoUnico,
      segmentos: [{ geometria: poligonoUnico, avanceInicio: 0, avanceFin: 0, avanceCentro: 0 }],
      longitud: 0
    };
  }
  const { total, muestras } = muestrasDeLinea(linea, anchoM, {
    soloVertices,
    paso,
    maxMuestras
  });
  if (!muestras.length || !muestras[0].izquierda) {
    return null;
  }
  const izquierda = muestras.map((muestra) => [muestra.izquierda.lng, muestra.izquierda.lat]);
  const derecha = muestras.map((muestra) => [muestra.derecha.lng, muestra.derecha.lat]);
  const anillo = [...izquierda, ...derecha.reverse(), [...izquierda[0]]];
  const poligonoCompleto = { type: 'Polygon', coordinates: [anillo] };
  const salidaSegmentos = [];
  if (segmentos) {
    for (let i = 0; i < muestras.length - 1; i += 1) {
      const a = muestras[i];
      const b = muestras[i + 1];
      salidaSegmentos.push({
        geometria: {
          type: 'Polygon',
          coordinates: [
            [
              [a.izquierda.lng, a.izquierda.lat],
              [b.izquierda.lng, b.izquierda.lat],
              [b.derecha.lng, b.derecha.lat],
              [a.derecha.lng, a.derecha.lat],
              [a.izquierda.lng, a.izquierda.lat]
            ]
          ]
        },
        avanceInicio: a.avance,
        avanceFin: b.avance,
        avanceCentro: (a.avance + b.avance) / 2
      });
    }
  }
  return { geometria: poligonoCompleto, segmentos: salidaSegmentos, longitud: total };
}

export function anchoPorTipo(tipo) {
  return ANCHOS_VIA[String(tipo || '')] || ANCHOS_VIA.otra;
}

/** Ancho declarado en OSM (`width` o `lanes`) o el ancho por tipo. */
export function anchoDePropiedades(tipo, propiedades = {}) {
  const width = Number(String(propiedades.width || '').replace(',', '.').replace(/[^\d.]/g, ''));
  if (Number.isFinite(width) && width > 2 && width < 80) return width;
  const lanes = Number(propiedades.lanes);
  if (Number.isFinite(lanes) && lanes > 0) return Math.min(60, lanes * 3.5);
  return anchoPorTipo(tipo);
}

/** Traduce las clases de OSM a los tipos del catálogo municipal. */
export function tipoDeViaOsm(highway) {
  const clave = String(highway || '').toLowerCase();
  if (['motorway', 'motorway_link'].includes(clave)) return 'autopista';
  if (['trunk', 'trunk_link', 'primary', 'primary_link'].includes(clave)) return 'carretera_federal';
  if (['secondary', 'secondary_link', 'tertiary', 'tertiary_link'].includes(clave)) {
    return 'carretera_estatal';
  }
  if (['track', 'road'].includes(clave)) return 'camino_rural';
  if (['residential', 'unclassified', 'living_street', 'service'].includes(clave)) return 'calle';
  return 'otra';
}

export function esViaVehicularOsm(highway) {
  return [
    'motorway',
    'motorway_link',
    'trunk',
    'trunk_link',
    'primary',
    'primary_link',
    'secondary',
    'secondary_link',
    'tertiary',
    'tertiary_link',
    'residential',
    'unclassified',
    'living_street',
    'service',
    'track',
    'road'
  ].includes(String(highway || '').toLowerCase());
}
