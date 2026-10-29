/**
 * Mapa Leaflet.
 *
 * Replica el comportamiento de la versión nueva del monolito:
 *  - el municipio es un **polígono real** (ya no un rectángulo bbox): el mapa
 *    encuadra ese polígono, limita el desplazamiento a su envolvente y sombrea
 *    con una máscara todo lo que quede fuera;
 *  - hay 3 capas base conmutables (Satélite, Calles y Relieve);
 *  - las zonas (colonias/tenencias) se dibujan como polígonos de geocerca.
 */
import {
  $,
  esc,
  fmtFechaCorta,
  textoAntiguedad,
  COLOR_HEX,
  etiquetaEstado,
  aplicarEstilosDinamicos
} from '../core/utils.js';
import { anillosDe, boundsDePoligono } from '../core/geocerca.js';

let mapa = null;
let marcadores = {};
let marcadorUsuario = null;
let circuloUsuario = null;
let capaMunicipio = null;
let capaMascara = null;
let capasZonas = [];
let capaBaseActiva = null;
let claveCapaActiva = 'satelite';
let controlCapas = null;
let zonasVisibles = true;
let modoElegir = false;
let alElegirUbicacion = null;

/**
 * Envolvente de Leaflet a partir del polígono [[lat,lng], …] o de un
 * multipolígono [[[lat,lng], …], …] (los municipios y localidades del INEGI
 * pueden tener varios anillos). Devuelve null si no hay polígono utilizable
 * (datos antiguos con `bbox`), para degradar a `center`/`zoom`.
 */
function boundsDe(poligono) {
  const anillos = anillosDe(poligono).filter((a) => a.length >= 3);
  if (!anillos.length) return null;
  const caja = boundsDePoligono(poligono);
  if (!caja) return null;
  const [[latMin, lngMin], [latMax, lngMax]] = caja;
  if (![latMin, lngMin, latMax, lngMax].every(Number.isFinite)) return null;
  return L.latLngBounds([latMin, lngMin], [latMax, lngMax]);
}

const CLAVE_CAPA = 'inc_capa_mapa';

function teselasEsri(servicio, attribution) {
  return L.tileLayer(
    `https://server.arcgisonline.com/ArcGIS/rest/services/${servicio}/MapServer/tile/{z}/{y}/{x}`,
    { maxZoom: 18, attribution, crossOrigin: true }
  );
}

function teselasEtiquetas() {
  return L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 18, crossOrigin: true, opacity: 0.9 }
  );
}

/** Catálogo único de capas; lo consumen el control y el tutorial. */
export const CATALOGO_CAPAS = {
  satelite: {
    etiqueta: 'Satélite',
    icono: 'bi-globe-americas',
    crear: () => teselasEsri('World_Imagery', '&copy; Esri, Maxar, Earthstar Geographics')
  },
  hibrido: {
    etiqueta: 'Satélite con etiquetas',
    icono: 'bi-geo-alt-fill',
    crear: () =>
      L.layerGroup([
        teselasEsri('World_Imagery', '&copy; Esri, Maxar, Earthstar Geographics'),
        teselasEtiquetas()
      ])
  },
  calles: {
    etiqueta: 'Calles',
    icono: 'bi-map-fill',
    crear: () => teselasEsri('World_Street_Map', '&copy; Esri, HERE, Garmin, FAO, USGS')
  },
  relieve: {
    etiqueta: 'Relieve / Topográfico',
    icono: 'bi-triangle-half',
    crear: () =>
      L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        maxNativeZoom: 17,
        subdomains: 'abc',
        attribution:
          'Map data: &copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap',
        crossOrigin: true
      })
  }
};

function guardarCapaBase(clave) {
  try {
    localStorage.setItem(CLAVE_CAPA, clave);
  } catch {
    // Almacenamiento no disponible (modo privado); se mantiene la capa en memoria.
  }
}

function leerCapaBase() {
  try {
    const clave = localStorage.getItem(CLAVE_CAPA);
    return clave && CATALOGO_CAPAS[clave] ? clave : 'satelite';
  } catch {
    return 'satelite';
  }
}

export function capasDisponibles() {
  return Object.entries(CATALOGO_CAPAS).map(([clave, definicion]) => ({
    clave,
    etiqueta: definicion.etiqueta,
    icono: definicion.icono
  }));
}

export function capaBaseActual() {
  return claveCapaActiva;
}

/** Cambia la capa base y persiste la elección en el dispositivo. */
export function cambiarCapaBase(clave) {
  if (!mapa || !CATALOGO_CAPAS[clave]) return false;
  if (capaBaseActiva) mapa.removeLayer(capaBaseActiva);
  capaBaseActiva = CATALOGO_CAPAS[clave].crear();
  capaBaseActiva.addTo(mapa);
  claveCapaActiva = clave;
  guardarCapaBase(clave);
  actualizarControlCapas();
  return true;
}

function restaurarCapaBase() {
  claveCapaActiva = leerCapaBase();
  capaBaseActiva = CATALOGO_CAPAS[claveCapaActiva].crear();
  capaBaseActiva.addTo(mapa);
}

function actualizarControlCapas() {
  const contenedor = controlCapas?.getContainer?.();
  if (!contenedor) return;
  contenedor.querySelectorAll('[data-capa]').forEach((boton) => {
    boton.setAttribute('aria-pressed', String(boton.dataset.capa === claveCapaActiva));
  });
}

function crearControlCapas() {
  const Control = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const contenedor = L.DomUtil.create('div', 'mapa-capas');
      contenedor.setAttribute('role', 'group');
      contenedor.setAttribute('aria-label', 'Capas del mapa');
      for (const [clave, definicion] of Object.entries(CATALOGO_CAPAS)) {
        const boton = L.DomUtil.create('button', 'mapa-capa', contenedor);
        boton.type = 'button';
        boton.dataset.capa = clave;
        boton.title = definicion.etiqueta;
        boton.setAttribute('aria-label', definicion.etiqueta);
        boton.setAttribute('aria-pressed', String(clave === claveCapaActiva));
        const icono = L.DomUtil.create('i', `bi ${definicion.icono}`, boton);
        icono.setAttribute('aria-hidden', 'true');
        const texto = L.DomUtil.create('span', 'mapa-capa-texto', boton);
        texto.textContent = definicion.etiqueta;
        L.DomEvent.on(boton, 'click', (evento) => {
          L.DomEvent.stop(evento);
          cambiarCapaBase(clave);
        });
      }
      L.DomEvent.disableClickPropagation(contenedor);
      L.DomEvent.disableScrollPropagation(contenedor);
      return contenedor;
    }
  });
  controlCapas = new Control().addTo(mapa);
}

export function inicializar(municipio) {
  if (mapa) return mapa;

  const bounds = boundsDe(municipio.poligono);
  mapa = L.map('map', {
    center: municipio.center,
    zoom: municipio.zoom,
    zoomControl: true,
    // No se puede arrastrar fuera del municipio (viscosity 1 = tope duro).
    ...(bounds ? { maxBounds: bounds.pad(0.03), maxBoundsViscosity: 1.0 } : {}),
    maxZoom: 18
  });

  restaurarCapaBase();
  crearControlCapas();

  // Encuadrar el municipio completo y no permitir alejarse más allá.
  if (bounds) {
    mapa.fitBounds(bounds, { padding: [12, 12] });
    mapa.setMinZoom(mapa.getBoundsZoom(bounds, false));
    dibujarLimiteMunicipio(municipio);
  }

  mapa.on('click', (evento) => {
    if (!modoElegir) return;
    modoElegir = false;
    mapa.getContainer().style.cursor = '';
    alElegirUbicacion?.(evento.latlng.lat, evento.latlng.lng);
  });

  return mapa;
}

/** Límite del municipio + máscara que oscurece todo lo de fuera. */
function dibujarLimiteMunicipio(municipio) {
  if (capaMunicipio) mapa.removeLayer(capaMunicipio);
  if (capaMascara) mapa.removeLayer(capaMascara);

  // Un municipio puede tener varios anillos (exclaves): se dibujan todos.
  const anillos = anillosDe(municipio.poligono);

  capaMunicipio = L.polygon(anillos, {
    color: '#006657',
    weight: 2.5,
    opacity: 0.9,
    fillOpacity: 0,
    interactive: false
  }).addTo(mapa);

  // Anillo exterior gigante con el municipio como "agujero" (regla evenodd):
  // solo se ve y se opera dentro del municipio.
  const mundo = [
    [-89, -179],
    [-89, 179],
    [89, 179],
    [89, -179]
  ];
  capaMascara = L.polygon([mundo, ...anillos], {
    stroke: false,
    fillColor: '#0b1f1c',
    fillOpacity: 0.45,
    interactive: false
  }).addTo(mapa);
  capaMascara.bringToBack();
}

/**
 * Enfoca el mapa en un municipio distinto del activo (selector del reporte).
 * Actualiza el límite de arrastre, el encuadre y la máscara.
 */
export function enfocarMunicipio(municipio) {
  if (!mapa || !municipio) return;
  // La ubicación anterior puede quedar fuera del nuevo municipio y no debe
  // quedar visible sobre el que se acaba de abrir.
  limpiarUbicacionUsuario();

  const bounds = boundsDe(municipio.poligono);
  if (!bounds) {
    mapa.setView(municipio.center, municipio.zoom || 12);
    return;
  }

  mapa.setMaxBounds(bounds.pad(0.03));
  mapa.fitBounds(bounds, { padding: [12, 12] });
  mapa.setMinZoom(mapa.getBoundsZoom(bounds, false));
  dibujarLimiteMunicipio(municipio);
}

/** Dibuja los polígonos de zona y actualiza la leyenda del mapa. */
export function dibujarZonas(zonas = []) {
  if (!mapa) return;
  capasZonas.forEach((capa) => mapa.removeLayer(capa));
  capasZonas = [];

  zonas.forEach((zona) => {
    const poligono = L.polygon(anillosDe(zona.poligono), {
      color: zona.color,
      weight: 2,
      opacity: 0.85,
      fillColor: zona.color,
      fillOpacity: 0.14
    });
    poligono.bindTooltip(
      `<strong>${esc(zona.nombre)}</strong><br><span class="u-fs-105px u-capitalizar">${esc(zona.tipo)}</span>`,
      { sticky: true }
    );
    poligono.zonaId = zona.id;
    if (zonasVisibles) poligono.addTo(mapa);
    capasZonas.push(poligono);
  });

  const leyenda = $('legendZonas');
  if (leyenda) {
    leyenda.innerHTML =
      zonas
        .map(
          (z) => `<div class="legend-item"><div class="legend-color" data-fondo="${esc(z.color)}"></div>
            ${esc(z.nombre)} <span class="u-suave u-capitalizar">· ${esc(z.tipo)}</span></div>`
        )
        .join('') || '<div class="u-fs-11px u-suave">Sin zonas definidas</div>';
    // El color de cada zona es un hex del catálogo: se aplica por CSSOM.
    aplicarEstilosDinamicos(leyenda);
  }
}

export function alternarZonas() {
  zonasVisibles = !zonasVisibles;
  capasZonas.forEach((capa) => {
    if (zonasVisibles) capa.addTo(mapa);
    else mapa.removeLayer(capa);
  });
  return zonasVisibles;
}

function crearIcono(incidencia, tipos) {
  const tipo = tipos.find((t) => t.id === incidencia.tipoId);
  const emoji = incidencia.iconoCustom || (tipo ? tipo.icono : '❗');
  // Las peligrosas llevan un anillo rojo pulsante para que salten a la vista.
  const peligrosa = incidencia.peligrosa === true ? ' pin-peligrosa' : '';
  // El color del marcador es el del semáforo de antigüedad: una clase y no un
  // estilo en línea. Un valor inesperado cae en el gris de respaldo.
  const color = COLOR_HEX[incidencia.color] ? incidencia.color : 'otro';
  return L.divIcon({
    className: 'marker-icon',
    html: `<div class="pin pin-${color}${peligrosa}">
             <span class="pin-inner">${emoji}</span>
           </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
}

/** Contenido del popup: recreado desde `Mapa.crearPopup` con delegación de eventos. */
export function contenidoPopup(incidencia, tipos) {
  const tipo = tipos.find((t) => t.id === incidencia.tipoId);
  const autor = incidencia.esAnonimo ? 'Anónimo' : esc(incidencia.autorNombre || incidencia.autor || '—');
  const descripcion = esc(incidencia.resumen || incidencia.descripcion || '');

  return `
    <div class="u-fs-13px u-min-200">
      ${
        incidencia.peligrosa
          ? '<div class="insignia-oculta">⚠️ INCIDENCIA PELIGROSA</div>'
          : ''
      }
      <div class="fila-icono">
        <span class="icono-13rem">${tipo ? tipo.icono : '❗'}</span>
        <strong class="u-tinta">${esc(incidencia.titulo)}</strong>
      </div>
      <div class="u-fs-11px u-gris-medio u-mb-4">
        ${esc(tipo ? tipo.nombre : '—')} · ${fmtFechaCorta(incidencia.fecha)}${
          incidencia.zonaNombre ? ' · ' + esc(incidencia.zonaNombre) : ''
        }
      </div>
      ${
        incidencia.ambito && incidencia.ambito !== 'urbano'
          ? `<div class="u-fs-11px u-gris-medio u-mb-4">🛣️ ${esc(
              incidencia.viaNombre || 'Vialidad'
            )}${incidencia.viaClave ? ' · ' + esc(incidencia.viaClave) : ''}${
              incidencia.kilometro != null ? ' · km ' + esc(String(incidencia.kilometro)) : ''
            }</div>`
          : ''
      }
      <div class="u-fs-12px u-pizarra u-lh-14 u-mb-8">
        ${descripcion.slice(0, 160)}${descripcion.length > 160 ? '…' : ''}
      </div>
      <div class="pila-filas-chica">
        <span class="pastilla-estado ${esc(incidencia.color)}">
          ${incidencia.estado === 'resuelta' ? 'RESUELTA' : textoAntiguedad(incidencia.dias)}
        </span>
        <span class="u-suave">${autor}</span>
      </div>
      <button class="boton-verde-ancho" data-action="detalle:abrir" data-id="${esc(incidencia.id)}">
        Ver detalles (${etiquetaEstado(incidencia.estado)})
      </button>
    </div>
  `;
}

/** Recoloca los marcadores según la lista filtrada. */
export function refrescarMarcadores(incidencias = [], tipos = []) {
  if (!mapa) return;
  Object.values(marcadores).forEach((m) => mapa.removeLayer(m));
  marcadores = {};

  incidencias.forEach((incidencia) => {
    if (incidencia.lat == null || incidencia.lng == null) return;
    const marcador = L.marker([incidencia.lat, incidencia.lng], {
      icon: crearIcono(incidencia, tipos)
    });
    marcador.bindPopup(contenidoPopup(incidencia, tipos), { maxWidth: 320 });
    marcador.addTo(mapa);
    marcadores[incidencia.id] = marcador;
  });
}

export function abrirPopup(id) {
  marcadores[id]?.openPopup();
}

/** Envolvente visible en el formato que espera el backend (`oeste,sur,este,norte`). */
export function bboxActual() {
  return mapa ? mapa.getBounds().toBBoxString() : null;
}

export function zoomActual() {
  return mapa ? mapa.getZoom() : 12;
}

/** Avisa al mover o hacer zoom, para recargar solo los puntos visibles. */
export function alMover(callback) {
  if (!mapa) return;
  mapa.on('moveend zoomend', callback);
}

/**
 * Pinta los puntos ligeros del endpoint `/incidencias/mapa`.
 * Los grupos se dibujan como un pin con el total; al pulsarlo se acerca.
 */
export function refrescarPuntos(puntos = [], tipos = []) {
  if (!mapa) return;
  Object.values(marcadores).forEach((m) => mapa.removeLayer(m));
  marcadores = {};

  puntos.forEach((punto, indice) => {
    if (punto.lat == null || punto.lng == null) return;

    if (punto.cluster) {
      const icono = L.divIcon({
        className: 'marker-cluster',
        html: `<div class="cluster-pin${punto.peligrosa ? ' cluster-peligro' : ''}">${punto.total}</div>`,
        iconSize: [42, 42],
        iconAnchor: [21, 21]
      });
      const marcador = L.marker([punto.lat, punto.lng], { icon: icono });
      marcador.bindTooltip(
        `${punto.total} incidencias · pulsa para acercar`,
        { direction: 'top' }
      );
      marcador.on('click', () => {
        mapa.setView([punto.lat, punto.lng], Math.min(mapa.getZoom() + 2, 18));
      });
      marcador.addTo(mapa);
      marcadores[`cluster_${indice}`] = marcador;
      return;
    }

    const marcador = L.marker([punto.lat, punto.lng], {
      icon: crearIcono(punto, tipos)
    });
    marcador.bindPopup(contenidoPopup(punto, tipos), { maxWidth: 320 });
    marcador.addTo(mapa);
    marcadores[punto.id] = marcador;
  });
}

/** Encuadra todo el municipio (equivale a `Mapa.centrarMunicipio`). */
export function centrarMunicipio(municipio) {
  const bounds = boundsDe(municipio?.poligono);
  if (!mapa || !bounds) return;
  mapa.fitBounds(bounds, { padding: [12, 12] });
}

export function fijarVista(lat, lng, zoom = 16) {
  mapa?.setView([lat, lng], zoom);
}

/** Pide la ubicación al navegador sin mover el mapa. */
export function obtenerUbicacion() {
  if (!navigator.geolocation) {
    throw new Error('Geolocalización no disponible en este navegador');
  }
  return new Promise((resolver, rechazar) => {
    navigator.geolocation.getCurrentPosition(
      (posicion) => resolver(posicion.coords),
      (error) => rechazar(new Error(error.message)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function crearIconoUsuario() {
  return L.divIcon({
    className: 'marker-usuario',
    html: '<div class="usuario-pin"><i class="bi bi-person-fill" aria-hidden="true"></i></div>',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20]
  });
}

/** Marca la ubicación GPS del usuario con un icono distinto de las incidencias. */
export function marcarUbicacionUsuario(coords) {
  if (!mapa || coords?.latitude == null || coords?.longitude == null) return null;
  limpiarUbicacionUsuario();

  const precision = Number(coords.accuracy);
  const textoPrecision = Number.isFinite(precision) ? ` (±${Math.round(precision)} m)` : '';
  marcadorUsuario = L.marker([coords.latitude, coords.longitude], {
    icon: crearIconoUsuario(),
    title: 'Tu ubicación',
    alt: 'Tu ubicación',
    zIndexOffset: 1000
  });
  marcadorUsuario.bindTooltip(`Tu ubicación${textoPrecision}`, { direction: 'top' });
  marcadorUsuario.addTo(mapa);

  // El círculo de precisión solo se dibuja si el GPS reporta un radio útil;
  // un valor enorme taparía el mapa.
  if (Number.isFinite(precision) && precision > 0 && precision <= 500) {
    circuloUsuario = L.circle([coords.latitude, coords.longitude], {
      radius: precision,
      color: '#2563eb',
      weight: 1,
      opacity: 0.55,
      fillColor: '#2563eb',
      fillOpacity: 0.08,
      interactive: false
    }).addTo(mapa);
  }
  return marcadorUsuario;
}

export function limpiarUbicacionUsuario() {
  if (marcadorUsuario) {
    mapa?.removeLayer(marcadorUsuario);
    marcadorUsuario = null;
  }
  if (circuloUsuario) {
    mapa?.removeLayer(circuloUsuario);
    circuloUsuario = null;
  }
}

export async function centrarEnUsuario() {
  const coords = await obtenerUbicacion();
  mapa?.setView([coords.latitude, coords.longitude], 16);
  marcarUbicacionUsuario(coords);
  return coords;
}

/** Activa el modo "haz clic en el mapa" del formulario. */
export function activarModoElegir(callback) {
  modoElegir = true;
  alElegirUbicacion = callback;
  mapa.getContainer().style.cursor = 'crosshair';
}

export function modoElegirActivo() {
  return modoElegir;
}

export function cancelarModoElegir() {
  modoElegir = false;
  mapa.getContainer().style.cursor = '';
}

/** Cambia de municipio activo (paridad con `Mapa.resetMunicipio`). */
export function reiniciarMunicipio(municipio) {
  limpiarUbicacionUsuario();
  const bounds = boundsDe(municipio?.poligono);
  if (!mapa || !bounds) return;
  mapa.setMaxBounds(bounds.pad(0.03));
  mapa.fitBounds(bounds, { padding: [12, 12] });
  mapa.setMinZoom(mapa.getBoundsZoom(bounds, false));
  dibujarLimiteMunicipio(municipio);
}

/**
 * Avisa a Leaflet de que su contenedor cambió de tamaño.
 * El mapa mide el contenedor solo al crearse; al ocultar/mostrar el panel
 * lateral queda una franja en blanco hasta que se recalcula. Se llama varias
 * veces para cubrir toda la transición CSS del panel (.25 s).
 */
export function invalidarTamano() {
  if (!mapa) return;
  requestAnimationFrame(() => mapa.invalidateSize());
  setTimeout(() => mapa.invalidateSize(), 130);
  setTimeout(() => mapa.invalidateSize(), 270);
}

export function instancia() {
  return mapa;
}
