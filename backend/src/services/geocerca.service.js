/**
 * SERVICIO: Geocerca por polígonos.
 *
 * Puerto directo de `puntoEnPoligono()` / `zonaDePunto()` del monolito
 * (algoritmo ray-casting). Aquí vive en el servidor porque es una regla de
 * integridad: un reporte fuera de las zonas autorizadas debe rechazarse aunque
 * el cliente lo intente por API.
 *
 * Desde la versión nueva del monolito el municipio también es un polígono real
 * (antes era un rectángulo `bbox`), así que además de la zona se puede
 * comprobar el límite municipal, que es lo que la interfaz oscurece en el mapa.
 */

import { bboxDePoligono, dentroDeBbox, puntoEnPoligono } from '../utils/geometria.js';

export { puntoEnPoligono, dentroDeBbox };

/** Primera zona que contiene el punto, o null. */
export function zonaDePunto(lat, lng, zonas = []) {
  return zonas.find((z) => puntoEnPoligono(lat, lng, z.poligono)) || null;
}

/** ¿El punto cae dentro del límite (polígono) del municipio? */
export function dentroDelMunicipio(lat, lng, municipio) {
  if (!municipio?.poligono) return false;
  // Filtro barato contra la envolvente antes del ray-casting.
  if (!dentroDeBbox(lat, lng, bboxDePoligono(municipio.poligono))) return false;
  return puntoEnPoligono(lat, lng, municipio.poligono);
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
