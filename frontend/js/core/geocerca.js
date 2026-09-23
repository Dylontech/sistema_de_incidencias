/**
 * Geocerca en el cliente.
 *
 * Es la MISMA regla que valida el backend (services/geocerca.service.js).
 * Aquí solo sirve para dar feedback inmediato al ciudadano (badge de zona y
 * mensaje de error); la validación que manda es siempre la del servidor.
 */

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

/**
 * Normaliza a una lista de anillos.
 * Los municipios y las localidades del INEGI pueden tener varios (islas,
 * exclaves, barrios separados); el formato antiguo era un solo anillo.
 */
export function anillosDe(poligono) {
  if (!Array.isArray(poligono) || poligono.length === 0) return [];
  const primero = poligono[0];
  if (Array.isArray(primero) && Array.isArray(primero[0])) return poligono;
  return [poligono];
}

export function zonaDePunto(lat, lng, zonas = []) {
  return zonas.find((z) => puntoEnPoligono(lat, lng, z.poligono)) || null;
}

/**
 * Envolvente [[latMin, lngMin], [latMax, lngMax]] de un polígono.
 * Equivale a `bboxDePoligono` del backend.
 */
export function boundsDePoligono(poligono = []) {
  const vertices = anillosDe(poligono).flat();
  if (!vertices.length) return null;
  const lats = vertices.map((v) => Number(v[0]));
  const lngs = vertices.map((v) => Number(v[1]));
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)]
  ];
}

/** Centroide simple (promedio de vértices), para centrar vistas. */
export function centroDePoligono(poligono = []) {
  const vertices = anillosDe(poligono).flat();
  const n = vertices.length || 1;
  const suma = vertices.reduce(
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
