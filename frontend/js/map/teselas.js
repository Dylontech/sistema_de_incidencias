/**
 * Cálculo de teselas Web Mercator para descargar el mapa de un municipio.
 *
 * Se mantiene aparte de la descarga (mapa-offline.js) para poder probar la
 * aritmética sin navegador: no toca DOM, caché ni red.
 */

/** Tesela (x, y) que contiene un punto en un zoom dado. */
export function teselaDe(lat, lng, zoom) {
  const n = 2 ** zoom;
  const latSegura = Math.max(-85.05112878, Math.min(85.05112878, Number(lat) || 0));
  const lngSegura = Math.max(-180, Math.min(180, Number(lng) || 0));
  const latRad = (latSegura * Math.PI) / 180;
  const x = Math.floor(((lngSegura + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return {
    x: Math.min(n - 1, Math.max(0, x)),
    y: Math.min(n - 1, Math.max(0, y))
  };
}

/** Todas las teselas de un bbox `[[latMin, lngMin], [latMax, lngMax]]`. */
export function teselasDelBbox(bbox, zoom) {
  if (!Array.isArray(bbox) || bbox.length !== 2) return [];
  const [[latMin, lngMin], [latMax, lngMax]] = bbox;
  if (![latMin, lngMin, latMax, lngMax].every(Number.isFinite)) return [];
  const noroeste = teselaDe(latMax, lngMin, zoom);
  const sureste = teselaDe(latMin, lngMax, zoom);
  const lista = [];
  for (let x = noroeste.x; x <= sureste.x; x += 1) {
    for (let y = noroeste.y; y <= sureste.y; y += 1) {
      lista.push({ x, y, z: zoom });
    }
  }
  return lista;
}

/**
 * Teselas del municipio entre `zoomMin` y `zoomMax`.
 *
 * Si la suma supera `maximo`, se van quitando los niveles de zoom más altos
 * (los que más pesan) y, como último recurso, se recorta la lista. Así una
 * descarga nunca llena el dispositivo por un municipio grande.
 */
export function teselasDelMunicipio(bbox, zoomMin, zoomMax, maximo = 900) {
  const desde = Math.max(0, Math.min(Number(zoomMin) || 0, 22));
  const hasta = Math.max(desde, Math.min(Number(zoomMax) || desde, 22));
  const totales = [];
  for (let z = desde; z <= hasta; z += 1) totales.push(...teselasDelBbox(bbox, z));
  if (totales.length <= maximo) return totales;
  for (let z = hasta; z > desde; z -= 1) {
    const sinNivel = totales.filter((t) => t.z < z);
    if (sinNivel.length <= maximo) return sinNivel;
  }
  // Solo el primer nivel ya es demasiado grande: se recorta el centro.
  const primero = totales.filter((t) => t.z === desde);
  const inicio = Math.max(0, Math.floor((primero.length - maximo) / 2));
  return primero.slice(inicio, inicio + maximo);
}

/** Sustituye los marcadores `{s}`, `{z}`, `{x}` e `{y}` de una plantilla. */
export function urlTesela(plantilla, { x, y, z }, subdominios = '') {
  let s = '';
  if (subdominios) {
    const letras = String(subdominios).split('');
    s = letras[(x + y) % letras.length] || letras[0];
  }
  return String(plantilla)
    .replace('{s}', s)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/** Tamaño aproximado de una descarga (para avisar antes de empezar). */
export function estimarBytes(teselas, bytesPorTesela = 16 * 1024) {
  return Math.max(0, teselas.length * bytesPorTesela);
}
