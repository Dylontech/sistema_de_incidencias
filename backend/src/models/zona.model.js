/**
 * MODELO: Zona de responsabilidad (colonia / tenencia).
 * El polígono es una lista de vértices [lat, lng] sin cerrar (el último se une
 * con el primero). Es la base de la geocerca estricta de reportes.
 */

export const TIPOS_ZONA = ['colonia', 'tenencia', 'zona'];

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

export function publica(zona) {
  if (!zona) return null;
  return {
    id: zona.id,
    municipioId: zona.municipioId,
    nombre: zona.nombre,
    tipo: zona.tipo,
    color: zona.color,
    poligono: zona.poligono
  };
}

/** Bounding box [[latMin, lngMin], [latMax, lngMax]] de un polígono. */
export function bboxDePoligono(poligono) {
  const lats = poligono.map((v) => Number(v[0]));
  const lngs = poligono.map((v) => Number(v[1]));
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)]
  ];
}

/** Centroide simple (promedio de vértices), útil para centrar el mapa. */
export function centroDePoligono(poligono) {
  const n = poligono.length;
  const suma = poligono.reduce((acc, v) => [acc[0] + Number(v[0]), acc[1] + Number(v[1])], [0, 0]);
  return [suma[0] / n, suma[1] / n];
}
