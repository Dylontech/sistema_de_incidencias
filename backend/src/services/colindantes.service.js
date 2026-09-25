/**
 * SERVICIO: municipios colindantes.
 *
 * Un municipio es colindante de otro cuando sus fronteras se tocan. La pregunta
 * se responde con geometría, no con una lista escrita a mano: el catálogo del
 * INEGI ya trae el contorno de los 175 municipios.
 *
 * Cómo se decide
 * --------------
 * Los contornos vienen simplificados municipio a municipio, así que dos vecinos
 * **no siempre comparten los mismos vértices** (Cuauhtémoc y Benito Juárez, por
 * ejemplo, solo se acercan a 1 metro y sin ningún vértice idéntico). Por eso no
 * se comparan vértices: se mide la **distancia mínima entre las dos fronteras**
 * y se acepta un margen pequeño (`EPSILON`, unos 100 m), que en el catálogo
 * separa con holgura los vecinos reales (0–1 m) de los que solo están cerca
 * (600 m o más).
 *
 * Para que sea rápido se indexan los vértices en una rejilla de ~550 m y solo
 * se miden los que caen en celdas contiguas, después de descartar por caja
 * envolvente. El resultado se memoriza por municipio.
 */
import { AppError } from '../utils/AppError.js';
import { anillosDe, bboxDePoligono } from '../utils/geometria.js';

/** Margen para considerar que dos fronteras se tocan (~100 m). */
const EPSILON = 0.0009;
/** Lado de la celda de la rejilla espacial (~550 m). */
const CELDA = 0.005;

/**
 * Distancia (en grados, con proyección local) del punto (lat, lng) al segmento
 * que va de `a` a `b`. `escala` corrige la longitud según la latitud.
 */
function distanciaPuntoSegmento(lat, lng, aLat, aLng, bLat, bLng, escala) {
  const px = lng * escala;
  const py = lat;
  const ax = aLng * escala;
  const ay = aLat;
  const bx = bLng * escala;
  const by = bLat;

  const dx = bx - ax;
  const dy = by - ay;
  const largo = dx * dx + dy * dy;
  let t = largo === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / largo;
  t = t < 0 ? 0 : t > 1 ? 1 : t;

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Prepara la geometría de un municipio: caja envolvente y vértices indexados
 * en celdas (cada vértice guarda también el final de su segmento).
 */
function crearHuella(municipio) {
  const anillos = anillosDe(municipio.poligono).filter((a) => a.length >= 3);
  const rejilla = new Map();

  for (const anillo of anillos) {
    for (let i = 0; i < anillo.length; i++) {
      const lat = Number(anillo[i][0]);
      const lng = Number(anillo[i][1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const siguiente = anillo[(i + 1) % anillo.length];
      const clave = `${Math.floor(lat / CELDA)},${Math.floor(lng / CELDA)}`;
      let celda = rejilla.get(clave);
      if (!celda) {
        celda = [];
        rejilla.set(clave, celda);
      }
      celda.push({
        lat,
        lng,
        sigLat: Number(siguiente[0]),
        sigLng: Number(siguiente[1])
      });
    }
  }

  return { rejilla, bbox: bboxDePoligono(municipio.poligono) };
}

/** Descarta pares de municipios cuyas cajas envolventes ni se rozan. */
function bboxesCerca(a, b) {
  const margen = EPSILON * 2;
  return !(
    b[0][0] > a[1][0] + margen ||
    b[1][0] < a[0][0] - margen ||
    b[0][1] > a[1][1] + margen ||
    b[1][1] < a[0][1] - margen
  );
}

/** ¿Las fronteras de las dos huellas se tocan? */
function seTocan(a, b) {
  const escala = Math.cos((((a.bbox[0][0] + a.bbox[1][0]) / 2) * Math.PI) / 180);

  for (const [clave, vertices] of a.rejilla) {
    const [fila, columna] = clave.split(',').map(Number);

    // Solo los vértices de las celdas contiguas pueden estar a menos de EPSILON.
    for (let df = -1; df <= 1; df++) {
      for (let dc = -1; dc <= 1; dc++) {
        const candidatos = b.rejilla.get(`${fila + df},${columna + dc}`);
        if (!candidatos) continue;

        for (const va of vertices) {
          for (const vb of candidatos) {
            // Vértices practicamente iguales (fronteras que coinciden).
            if (
              Math.abs(va.lat - vb.lat) < EPSILON &&
              Math.abs(va.lng - vb.lng) * escala < EPSILON
            ) {
              return true;
            }
            // Vértice de A junto al segmento de B (y al revés): es el caso
            // habitual cuando cada municipio simplificó su contorno aparte.
            if (distanciaPuntoSegmento(va.lat, va.lng, vb.lat, vb.lng, vb.sigLat, vb.sigLng, escala) < EPSILON) {
              return true;
            }
            if (distanciaPuntoSegmento(vb.lat, vb.lng, va.lat, va.lng, va.sigLat, va.sigLng, escala) < EPSILON) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

/**
 * Memoriza el cálculo mientras el catálogo no cambie.
 * La firma detecta cambios de tamaño u orden del catálogo (pruebas, importaciones).
 */
let cache = { firma: '', huellas: new Map(), vecinos: new Map() };

function prepararCache(municipios) {
  const firma = `${municipios.length}|${municipios[0]?.id ?? ''}|${municipios[municipios.length - 1]?.id ?? ''}`;
  if (cache.firma !== firma) cache = { firma, huellas: new Map(), vecinos: new Map() };
  return cache;
}

function huellaDe(c, municipio) {
  if (!c.huellas.has(municipio.id)) c.huellas.set(municipio.id, crearHuella(municipio));
  return c.huellas.get(municipio.id);
}

/** Municipios cuyas fronteras tocan las del indicado (sin incluirlo). */
function vecinosDe(municipios, municipio) {
  const c = prepararCache(municipios);
  if (c.vecinos.has(municipio.id)) return c.vecinos.get(municipio.id);

  const suya = huellaDe(c, municipio);
  const vecinos = municipios.filter((otro) => {
    if (otro.id === municipio.id) return false;
    const ajena = huellaDe(c, otro);
    return bboxesCerca(suya.bbox, ajena.bbox) && seTocan(suya, ajena);
  });

  c.vecinos.set(municipio.id, vecinos);
  return vecinos;
}

/**
 * Colindantes de un municipio, ordenados por estado y nombre.
 * Devuelve solo lo que necesita la interfaz para pintar los botones.
 */
export async function colindantes(repositorio, municipioId) {
  const municipio = await repositorio.municipioPorId(municipioId);
  if (!municipio) throw AppError.noEncontrado('Municipio no encontrado');

  const municipios = await repositorio.todosMunicipios();
  return vecinosDe(municipios, municipio)
    .map((m) => ({ id: m.id, nombre: m.nombre, estado: m.estado }))
    .sort(
      (a, b) =>
        String(a.estado).localeCompare(String(b.estado), 'es') ||
        a.nombre.localeCompare(b.nombre, 'es')
    );
}
