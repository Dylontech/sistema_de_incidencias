/**
 * Geometría compartida por municipios y zonas.
 *
 * Se usa el mismo algoritmo ray-casting que el monolito (y su versión nueva):
 * los reportes solo se aceptan dentro de una zona (colonia/tenencia/localidad)
 * y la zona debe pertenecer al municipio del reportante.
 *
 * Los datos del INEGI llegan como *multipolígonos* (un municipio o una
 * localidad puede tener varios anillos: exclaves, islas, barrios separados).
 * Para no romper los datos anteriores (un solo anillo) todas las funciones
 * aceptan las dos formas a través de `anillosDe()`:
 *   - anillo único  -> [[lat,lng], …]
 *   - multipolígono -> [[[lat,lng], …], …]
 */

/**
 * Normaliza la entrada a una lista de anillos.
 * Un polígono simple [[lat,lng], …] se devuelve como [anillo].
 */
export function anillosDe(poligono) {
  if (!Array.isArray(poligono) || poligono.length === 0) return [];
  const primero = poligono[0];
  // Si el primer elemento ya es una lista de vértices, es un multipolígono.
  if (Array.isArray(primero) && Array.isArray(primero[0])) return poligono;
  return [poligono];
}

/** ¿El punto (lat, lng) está dentro de alguno de los anillos? */
export function puntoEnPoligono(lat, lng, poligono) {
  return anillosDe(poligono).some((anillo) => puntoEnAnillo(lat, lng, anillo));
}

/** Ray-casting sobre un anillo suelto. */
export function puntoEnAnillo(lat, lng, anillo) {
  if (!Array.isArray(anillo) || anillo.length < 3) return false;
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const yi = Number(anillo[i][0]);
    const xi = Number(anillo[i][1]);
    const yj = Number(anillo[j][0]);
    const xj = Number(anillo[j][1]);
    const interseca =
      (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (interseca) dentro = !dentro;
  }
  return dentro;
}

/** Un anillo suelto es válido si tiene al menos 3 vértices [lat, lng] en rango. */
export function anilloValido(anillo) {
  if (!Array.isArray(anillo) || anillo.length < 3) return false;
  return anillo.every(
    (vertice) =>
      Array.isArray(vertice) &&
      vertice.length === 2 &&
      Number.isFinite(Number(vertice[0])) &&
      Number.isFinite(Number(vertice[1])) &&
      Math.abs(Number(vertice[0])) <= 90 &&
      Math.abs(Number(vertice[1])) <= 180
  );
}

/** Válido si tiene al menos un anillo y todos los anillos son válidos. */
export function poligonoValido(poligono) {
  const anillos = anillosDe(poligono);
  if (!anillos.length) return false;
  return anillos.every((anillo) => anilloValido(anillo));
}

/** Envolvente [[latMin, lngMin], [latMax, lngMax]] de todos los anillos. */
export function bboxDePoligono(poligono) {
  const vertices = anillosDe(poligono).flat();
  if (!vertices.length) return null;
  const lats = vertices.map((v) => Number(v[0]));
  const lngs = vertices.map((v) => Number(v[1]));
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)]
  ];
}

/**
 * Centro del polígono: centroide del anillo más extenso (el cuerpo principal
 * del municipio o la localidad). Así no se desvía cuando hay exclaves lejanos.
 */
export function centroDePoligono(poligono) {
  const anillos = anillosDe(poligono).filter((a) => a.length >= 3);
  if (!anillos.length) return null;
  const principal = anillos.reduce((a, b) => (areaDeAnillo(b) > areaDeAnillo(a) ? b : a));
  return centroideDeAnillo(principal);
}

/** Área (en grados²) por la fórmula del cordón de zapato. */
export function areaDeAnillo(anillo) {
  if (!Array.isArray(anillo) || anillo.length < 3) return 0;
  let suma = 0;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    suma +=
      Number(anillo[j][0]) * Number(anillo[i][1]) - Number(anillo[i][0]) * Number(anillo[j][1]);
  }
  return Math.abs(suma / 2);
}

/** Centroide real (ponderado por área) con respaldo al promedio de vértices. */
export function centroideDeAnillo(anillo) {
  let areaDoble = 0;
  let cy = 0;
  let cx = 0;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const yj = Number(anillo[j][0]);
    const xj = Number(anillo[j][1]);
    const yi = Number(anillo[i][0]);
    const xi = Number(anillo[i][1]);
    const cruz = xj * yi - xi * yj;
    areaDoble += cruz;
    cy += (yj + yi) * cruz;
    cx += (xj + xi) * cruz;
  }
  if (Math.abs(areaDoble) < 1e-12) return centroDeVertices(anillo);
  return [cy / (3 * areaDoble), cx / (3 * areaDoble)];
}

/** Promedio simple de vértices (último recurso para anillos degenerados). */
export function centroDeVertices(anillo) {
  const n = anillo.length || 1;
  const suma = anillo.reduce(
    (acc, v) => [acc[0] + Number(v[0]), acc[1] + Number(v[1])],
    [0, 0]
  );
  return [suma[0] / n, suma[1] / n];
}

/**
 * Simplificación Douglas-Peucker: conserva la forma descartando vértices que
 * no aportan más de `tolerancia` (en grados). Si el anillo degenera en una
 * recta se devuelve el original para no perder la zona.
 */
export function simplificarAnillo(anillo, tolerancia) {
  if (!Array.isArray(anillo) || anillo.length <= 3) return (anillo || []).slice();
  if (!(tolerancia > 0)) return anillo.slice();

  const origen = anillo.map((v) => [Number(v[0]), Number(v[1])]);
  const conservar = new Array(origen.length).fill(false);
  conservar[0] = true;
  conservar[origen.length - 1] = true;

  const pila = [[0, origen.length - 1]];
  while (pila.length) {
    const [inicio, fin] = pila.pop();
    let indiceMax = -1;
    let distanciaMax = 0;
    for (let i = inicio + 1; i < fin; i++) {
      const d = distanciaASegmento(origen[i], origen[inicio], origen[fin]);
      if (d > distanciaMax) {
        distanciaMax = d;
        indiceMax = i;
      }
    }
    if (indiceMax !== -1 && distanciaMax > tolerancia) {
      conservar[indiceMax] = true;
      pila.push([inicio, indiceMax], [indiceMax, fin]);
    }
  }

  const resultado = origen.filter((_, i) => conservar[i]);
  return resultado.length >= 3 ? resultado : anillo.slice();
}

/** Distancia (en grados) de un punto al segmento p0-p1. */
function distanciaASegmento(punto, p0, p1) {
  const dx = p1[1] - p0[1];
  const dy = p1[0] - p0[0];
  if (dx === 0 && dy === 0) return Math.hypot(punto[1] - p0[1], punto[0] - p0[0]);
  let t = ((punto[1] - p0[1]) * dx + (punto[0] - p0[0]) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(punto[1] - (p0[1] + t * dx), punto[0] - (p0[0] + t * dy));
}

/** Comprobación barata contra la envolvente, antes del ray-casting. */
export function dentroDeBbox(lat, lng, bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 2) return false;
  const [[latMin, lngMin], [latMax, lngMax]] = bbox;
  return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax;
}
