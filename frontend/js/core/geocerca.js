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
