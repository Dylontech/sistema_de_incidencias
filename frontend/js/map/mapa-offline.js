/**
 * Mapa del municipio disponible sin conexión.
 *
 * Estrategia para no gastar espacio:
 * - Solo se descarga **a petición del usuario** y de la capa base activa.
 * - Se guardan los zooms del municipio (`zoom` del catálogo) y dos niveles más,
 *   con un máximo de 900 teselas y 20 MB en total.
 * - A lo sumo se conservan 3 municipios; al añadir otro se borra el que lleva
 *   más tiempo sin usarse (LRU), y antes de descargar se comprueba la cuota real
 *   del navegador (`navigator.storage.estimate`).
 * - Las teselas viven en Cache Storage (`inc-teselas-v1`) para que el service
 *   worker las sirva sin red; los metadatos y las URLs van en `localStorage`.
 */
import { boundsDePoligono } from '../core/geocerca.js';
import { formatoBytes } from '../core/utils.js';
import { capasParaDescarga } from './mapa.js';
import { estimarBytes, teselasDelMunicipio, urlTesela } from './teselas.js';

export const CACHE_TESELAS = 'inc-teselas-v1';
const CLAVE = 'inc_mapas_offline_v1';
const MAX_TESELAS = 900;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_MUNICIPIOS = 3;
const CONCURRENCIA = 4;

let controlador = null;
let enCurso = false;

function leer() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {};
  } catch {
    return {};
  }
}

function guardar(datos) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    // Sin espacio para metadatos: la descarga se considera fallida.
    throw new Error('No hay espacio en el dispositivo para registrar el mapa');
  }
}

/** Municipios descargados, del más reciente al más antiguo. */
export function resumen() {
  return Object.values(leer()).sort((a, b) => (b.ultimoUso || 0) - (a.ultimoUso || 0));
}

export function mapaDescargado(municipioId) {
  return leer()[String(municipioId)] || null;
}

export function enDescarga() {
  return enCurso;
}

/** Cuota del dispositivo (usage, quota) o null si el navegador no la expone. */
export async function cuota() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

/** Texto corto del estado de un municipio para la interfaz. */
export function describir(municipioId) {
  const mapa = mapaDescargado(municipioId);
  if (!mapa) return 'Mapa sin conexión no descargado.';
  const capas = mapa.capas?.length ? ` · ${mapa.capas.length} capas` : '';
  return `${mapa.nombre || 'Municipio'}: ${mapa.teselas} teselas · ${formatoBytes(mapa.bytes || 0)} · zooms ${mapa.zoomMin}–${mapa.zoomMax}${capas}`;
}

async function borrarUrlsSeguras(urls, datos, municipioId) {
  if (!('caches' in window) || !urls?.length) return;
  const enUso = new Set();
  for (const [id, mapa] of Object.entries(datos)) {
    if (id === String(municipioId)) continue;
    for (const url of mapa.urls || []) enUso.add(url);
  }
  const libres = urls.filter((url) => !enUso.has(url));
  if (!libres.length) return;
  const cache = await caches.open(CACHE_TESELAS);
  await Promise.all(libres.map((url) => cache.delete(url)));
}

export async function borrarMunicipio(municipioId) {
  const datos = leer();
  const clave = String(municipioId);
  const mapa = datos[clave];
  if (!mapa) return false;
  await borrarUrlsSeguras(mapa.urls || [], datos, clave);
  delete datos[clave];
  guardar(datos);
  return true;
}

export async function borrarTodo() {
  for (const mapa of Object.values(leer())) {
    await borrarMunicipio(mapa.id);
  }
}

/** Deja sitio quitando los municipios menos usados. */
async function hacerEspacio(municipioId, bytesPrevistos) {
  const datos = leer();
  const otros = Object.entries(datos)
    .filter(([id]) => id !== String(municipioId))
    .sort(([, a], [, b]) => (a.ultimoUso || 0) - (b.ultimoUso || 0));
  let total = otros.reduce((suma, [, m]) => suma + (m.bytes || 0), 0);
  let restantes = otros.length;
  for (const [id, mapa] of otros) {
    const excedeCantidad = restantes >= MAX_MUNICIPIOS;
    const excedeBytes = total + bytesPrevistos > MAX_BYTES;
    if (!excedeCantidad && !excedeBytes) break;
    await borrarMunicipio(id);
    total -= mapa.bytes || 0;
    restantes -= 1;
  }
  if (total + bytesPrevistos > MAX_BYTES) {
    throw new Error(
      `El mapa ocupa más de ${formatoBytes(MAX_BYTES)}. Borra otro mapa descargado para continuar.`
    );
  }
  const uso = await cuota();
  if (uso?.quota && uso.usage + bytesPrevistos > uso.quota * 0.85) {
    throw new Error('No hay espacio suficiente en el dispositivo; borra mapas descargados o libera espacio.');
  }
}

/** Cancela la descarga en curso. */
export function cancelar() {
  controlador?.abort();
}

/**
 * Descarga las teselas del municipio.
 * @param {Object} municipio objeto con `id`, `nombre`, `poligono` y `zoom`.
 * @param {{alProgreso?: Function}} opciones callback de progreso.
 */
export async function descargarMunicipio(municipio, { alProgreso } = {}) {
  if (enCurso) throw new Error('Ya hay una descarga de mapa en curso');
  const id = String(municipio?.id || '');
  if (!id) throw new Error('Municipio no válido');
  const bbox = boundsDePoligono(municipio.poligono);
  if (!bbox) throw new Error('Este municipio no tiene contorno para descargar');
  if (!('caches' in window)) {
    throw new Error('Tu navegador no permite guardar el mapa sin conexión');
  }

  const capas = capasParaDescarga();
  const zoomMin = Math.max(9, Math.min(Number(municipio.zoom) || 11, 14));
  // Las cuatro capas comparten cupo; satélite e híbrido usan la misma imagen y
  // se deduplican por URL para no gastar el doble de espacio.
  const porCapa = Math.max(40, Math.floor(MAX_TESELAS / Math.max(capas.length, 1)));
  const porUrl = new Map();
  for (const capa of capas) {
    const zoomMax = Math.min(zoomMin + 2, capa.maxZoom || 18);
    for (const tesela of teselasDelMunicipio(bbox, zoomMin, zoomMax, porCapa)) {
      const url = urlTesela(capa.url, tesela, capa.subdominios);
      if (!porUrl.has(url)) porUrl.set(url, capa.etiqueta);
    }
  }
  const pendientes = [...porUrl.keys()];
  if (!pendientes.length) throw new Error('No hay teselas para este municipio');
  const previstos = estimarBytes(pendientes.map((url) => ({ url })));
  await hacerEspacio(id, previstos);

  const anterior = mapaDescargado(id);
  if (anterior) await borrarMunicipio(id);

  enCurso = true;
  controlador = new AbortController();
  const cache = await caches.open(CACHE_TESELAS);
  const urls = [];
  let descargadas = 0;
  let bytes = 0;
  let errores = 0;

  const avisar = async (estado) => {
    if (!alProgreso) return;
    alProgreso({
      municipioId: id,
      estado,
      descargadas,
      total: porUrl.size,
      bytes,
      capas: capas.length,
      cuota: await cuota()
    });
  };
  await avisar('descargando');

  try {
    const trabajadores = Array.from({ length: CONCURRENCIA }, async () => {
      while (pendientes.length) {
        if (controlador.signal.aborted) return;
        const url = pendientes.shift();
        try {
          const guardada = await cache.match(url);
          if (guardada) {
            bytes += (await guardada.blob()).size;
          } else {
            const respuesta = await fetch(url, {
              signal: controlador.signal,
              mode: 'cors',
              credentials: 'omit'
            });
            if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
            const blob = await respuesta.blob();
            bytes += blob.size;
            await cache.put(
              url,
              new Response(blob, {
                headers: {
                  'Content-Type': respuesta.headers.get('Content-Type') || 'image/jpeg'
                }
              })
            );
          }
          urls.push(url);
        } catch (error) {
          if (error.name === 'AbortError') throw error;
          errores += 1;
        } finally {
          descargadas += 1;
          if (descargadas % 20 === 0 || descargadas === porUrl.size) {
            await avisar('descargando');
          }
        }
      }
    });
    await Promise.all(trabajadores);
  } catch (error) {
    // Cancelada: se limpian las teselas parciales de esta descarga.
    await borrarUrlsSeguras(urls, leer(), id);
    enCurso = false;
    controlador = null;
    if (error.name === 'AbortError') {
      await avisar('cancelado');
      return null;
    }
    throw error;
  } finally {
    enCurso = false;
    controlador = null;
  }

  if (!urls.length) {
    throw new Error('No se pudo descargar ninguna tesela; revisa la conexión.');
  }

  const datos = leer();
  datos[id] = {
    id,
    nombre: municipio.nombre || 'Municipio',
    capa: `${capas.length} capas`,
    capas: capas.map((capa) => capa.etiqueta),
    zoomMin,
    zoomMax,
    teselas: urls.length,
    bytes,
    urls,
    errores,
    actualizadoEn: new Date().toISOString(),
    ultimoUso: Date.now()
  };
  guardar(datos);
  await avisar('listo');
  return datos[id];
}

/** Marca el municipio como el último usado (para el LRU). */
export function tocar(municipioId) {
  const datos = leer();
  const clave = String(municipioId);
  if (!datos[clave]) return;
  datos[clave].ultimoUso = Date.now();
  try {
    guardar(datos);
  } catch {
    // Si no se puede actualizar el orden, no es crítico.
  }
}
