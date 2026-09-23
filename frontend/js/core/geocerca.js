/**
 * Geocerca en el cliente.
 *
 * Es la MISMA regla que valida el backend (services/geocerca.service.js).
 * Aquí solo sirve para dar feedback inmediato al ciudadano (badge de zona y
 * mensaje de error); la validación que manda es siempre la del servidor.
 */

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

export function zonaDePunto(lat, lng, zonas = []) {
  return zonas.find((z) => puntoEnPoligono(lat, lng, z.poligono)) || null;
}

/**
 * Envolvente [[latMin, lngMin], [latMax, lngMax]] de un polígono.
 * Equivale a `bboxDePoligono` del backend.
 */
export function boundsDePoligono(poligono = []) {
  const lats = poligono.map((v) => Number(v[0]));
  const lngs = poligono.map((v) => Number(v[1]));
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)]
  ];
}

/** Centroide simple (promedio de vértices), para centrar vistas. */
export function centroDePoligono(poligono = []) {
  const n = poligono.length || 1;
  const suma = poligono.reduce(
    (acc, v) => [acc[0] + Number(v[0]), acc[1] + Number(v[1])],
    [0, 0]
  );
  return [suma[0] / n, suma[1] / n];
}

/** ¿El punto cae dentro del polígono del municipio? */
export function dentroDelMunicipio(lat, lng, municipio) {
  if (!municipio?.poligono) return false;
  return puntoEnPoligono(lat, lng, municipio.poligono);
}

/** Interpreta "lat, lng" (paridad con `Incidencias.parsearCoords`). */
export function parsearCoordenadas(texto) {
  if (!texto) return null;
  const coincidencia = String(texto).match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  if (!coincidencia) return null;
  const lat = parseFloat(coincidencia[1]);
  const lng = parseFloat(coincidencia[2]);
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
