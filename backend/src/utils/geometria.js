/**
 * Geometría compartida por municipios y zonas.
 *
 * Se usa el mismo algoritmo ray-casting que el monolito (y su versión nueva):
 * los reportes solo se aceptan dentro de una zona (colonia/tenencia) y la zona
 * debe pertenecer al municipio del reportante.
 */

/** ¿El punto (lat, lng) está dentro del polígono [[lat,lng], …]? */
export function puntoEnPoligono(lat, lng, poligono) {
  if (!Array.isArray(poligono) || poligono.length < 3) return false;
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const yi = Number(poligono[i][0]);
    const xi = Number(poligono[i][1]);
    const yj = Number(poligono[j][0]);
    const xj = Number(poligono[j][1]);
    const interseca =
      (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (interseca) dentro = !dentro;
  }
  return dentro;
}

/** Un polígono es válido si tiene al menos 3 vértices [lat, lng] en rango. */
export function poligonoValido(poligono) {
  if (!Array.isArray(poligono) || poligono.length < 3) return false;
  return poligono.every(
    (vertice) =>
      Array.isArray(vertice) &&
      vertice.length === 2 &&
      Number.isFinite(Number(vertice[0])) &&
      Number.isFinite(Number(vertice[1])) &&
      Math.abs(Number(vertice[0])) <= 90 &&
      Math.abs(Number(vertice[1])) <= 180
  );
}

/** Envolvente [[latMin, lngMin], [latMax, lngMax]] del polígono. */
export function bboxDePoligono(poligono) {
  const lats = poligono.map((v) => Number(v[0]));
  const lngs = poligono.map((v) => Number(v[1]));
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)]
  ];
}

/** Centroide simple (promedio de vértices). */
export function centroDePoligono(poligono) {
  const n = poligono.length;
  const suma = poligono.reduce(
    (acc, v) => [acc[0] + Number(v[0]), acc[1] + Number(v[1])],
    [0, 0]
  );
  return [suma[0] / n, suma[1] / n];
}

/** Comprobación barata contra la envolvente, antes del ray-casting. */
export function dentroDeBbox(lat, lng, bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 2) return false;
  const [[latMin, lngMin], [latMax, lngMax]] = bbox;
  return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax;
}
