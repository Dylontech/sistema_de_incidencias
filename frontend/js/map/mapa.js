/**
 * Mapa Leaflet.
 *
 * Replica el comportamiento de la versión nueva del monolito:
 *  - el municipio es un **polígono real** (ya no un rectángulo bbox): el mapa
 *    encuadra ese polígono, limita el desplazamiento a su envolvente y sombrea
 *    con una máscara todo lo que quede fuera;
 *  - hay 4 capas base conmutables (Satélite, Calles, Relieve, Físico);
 *  - las zonas (colonias/tenencias) se dibujan como polígonos de geocerca.
 */
import { $, esc, fmtFechaCorta, textoAntiguedad, colorHex, etiquetaEstado } from '../core/utils.js';
import { anillosDe, boundsDePoligono } from '../core/geocerca.js';

let mapa = null;
let marcadores = {};
let capaMunicipio = null;
let capaMascara = null;
let capasZonas = [];
let capasBase = {};
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

/**
 * Capas base. Se usan servicios de Esri (satélite y calles) y OpenTopoMap
 * (relieve) porque no imponen las restricciones que la política de
 * OpenStreetMap aplica al tráfico directo desde el navegador.
 */
function crearCapasBase() {
  const satelital = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics',
      crossOrigin: true
    }
  );
  const calles = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, HERE, Garmin, FAO, USGS',
      crossOrigin: true
    }
  );
  const relieve = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    maxNativeZoom: 17,
    subdomains: 'abc',
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, SRTM | &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a>',
    crossOrigin: true
  });
  const fisico = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 8,
      maxNativeZoom: 8,
      attribution:
        '&copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, USGS, NOAA',
      crossOrigin: true
    }
  );

  return { Satélite: satelital, Calles: calles, 'Relieve / Topográfico': relieve, Físico: fisico };
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

  capasBase = crearCapasBase();
  capasBase['Satélite'].addTo(mapa);
  controlCapas = L.control
    .layers(capasBase, null, { position: 'topright', collapsed: true })
    .addTo(mapa);

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
      `<strong>${esc(zona.nombre)}</strong><br><span style="font-size:10.5px;text-transform:capitalize;">${esc(zona.tipo)}</span>`,
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
          (z) => `<div class="legend-item"><div class="legend-color" style="background:${z.color};"></div>
            ${esc(z.nombre)} <span style="color:#94a3b8;text-transform:capitalize;">· ${esc(z.tipo)}</span></div>`
        )
        .join('') || '<div style="font-size:11px;color:#94a3b8;">Sin zonas definidas</div>';
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
  return L.divIcon({
    className: 'marker-icon',
    html: `<div class="pin${peligrosa}" style="background:${colorHex(incidencia.color)};">
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
  const descripcion = esc(incidencia.descripcion);
  const color = colorHex(incidencia.color);

  return `
    <div style="font-size:13px;min-width:200px;">
      ${
        incidencia.peligrosa
          ? '<div style="background:#dc2626;color:#fff;font-size:11px;font-weight:800;border-radius:6px;padding:3px 8px;margin-bottom:6px;text-align:center;">⚠️ INCIDENCIA PELIGROSA</div>'
          : ''
      }
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span style="font-size:1.3rem;">${tipo ? tipo.icono : '❗'}</span>
        <strong style="color:#1a202c;">${esc(incidencia.titulo)}</strong>
      </div>
      <div style="font-size:11px;color:#718096;margin-bottom:4px;">
        ${esc(tipo ? tipo.nombre : '—')} · ${fmtFechaCorta(incidencia.fecha)}${
          incidencia.zonaNombre ? ' · ' + esc(incidencia.zonaNombre) : ''
        }
      </div>
      <div style="font-size:12px;color:#4a5568;line-height:1.4;margin-bottom:8px;">
        ${descripcion.slice(0, 160)}${descripcion.length > 160 ? '…' : ''}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:10.5px;">
        <span style="background:${color};color:${incidencia.color === 'amarillo' ? '#333' : '#fff'};padding:2px 8px;border-radius:8px;font-weight:700;">
          ${incidencia.estado === 'resuelta' ? 'RESUELTA' : textoAntiguedad(incidencia.dias)}
        </span>
        <span style="color:#94a3b8;">${autor}</span>
      </div>
      <button data-action="detalle:abrir" data-id="${esc(incidencia.id)}"
        style="margin-top:8px;width:100%;padding:6px;background:#006657;color:#fff;border:none;border-radius:6px;font-size:11.5px;font-weight:600;cursor:pointer;">
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

/** Encuadra todo el municipio (equivale a `Mapa.centrarMunicipio`). */
export function centrarMunicipio(municipio) {
  const bounds = boundsDe(municipio?.poligono);
  if (!mapa || !bounds) return;
  mapa.fitBounds(bounds, { padding: [12, 12] });
}

export function fijarVista(lat, lng, zoom = 16) {
  mapa?.setView([lat, lng], zoom);
}

export function centrarEnUsuario() {
  if (!navigator.geolocation) {
    throw new Error('Geolocalización no disponible en este navegador');
  }
  return new Promise((resolver, rechazar) => {
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        mapa?.setView([posicion.coords.latitude, posicion.coords.longitude], 16);
        resolver(posicion.coords);
      },
      (error) => rechazar(new Error(error.message)),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
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
