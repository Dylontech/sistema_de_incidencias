/**
 * SERVICIO: Geocerca por polígonos.
 *
 * Puerto directo de `puntoEnPoligono()` / `zonaDePunto()` del monolito
 * (algoritmo ray-casting). Aquí vive en el servidor porque es una regla de
 * integridad: un reporte fuera de las zonas autorizadas debe rechazarse aunque
 * el cliente lo intente por API.
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

/** Primera zona que contiene el punto, o null. */
export function zonaDePunto(lat, lng, zonas = []) {
  return zonas.find((z) => puntoEnPoligono(lat, lng, z.poligono)) || null;
}

/** Comprobación rápida contra el rectángulo del municipio. */
export function dentroDeBbox(lat, lng, bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 2) return false;
  const [[latMin, lngMin], [latMax, lngMax]] = bbox;
  return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax;
}

/** Zona y municipio de un punto, buscando en uno o en todos los municipios. */
export function localizarZona(lat, lng, zonas) {
  const zona = zonaDePunto(lat, lng, zonas);
  if (!zona) return { zona: null, municipioId: null };
  return { zona, municipioId: zona.municipioId };
}

/**
 * Interpreta texto "lat, lng" (paridad con `Incidencias.parsearCoords`).
 * @returns {{lat:number,lng:number}|null}
 */
export function parsearCoordenadas(texto) {
  if (!texto) return null;
  const m = String(texto).match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}
