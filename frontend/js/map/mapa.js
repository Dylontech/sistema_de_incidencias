/**
 * Mapa Leaflet.
 *
 * Puerto directo del módulo `Mapa` del monolito: capa satelital de Esri,
 * límite del municipio, polígonos de zona (geocerca), marcadores con emoji y
 * modo "elegir ubicación" para el formulario.
 */
import { $, esc, fmtFechaCorta, textoAntiguedad, colorHex, etiquetaEstado } from '../core/utils.js';

let mapa = null;
let marcadores = {};
let capaMunicipio = null;
let capasZonas = [];
let zonasVisibles = true;
let modoElegir = false;
let alElegirUbicacion = null;

/** Mosaicos: se usa Esri World Imagery porque OSM bloquea peticiones sin referer identificable. */
function crearCapaBase() {
  return L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics',
      crossOrigin: true
    }
  );
  /* Alternativa con OpenStreetMap (dejar preparada, como en el monolito):
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    crossOrigin: true,
    referrerPolicy: 'strict-origin-when-cross-origin'
  });
  */
}

export function inicializar(municipio) {
  if (mapa) return mapa;
  mapa = L.map('map', {
    center: municipio.center,
    zoom: municipio.zoom,
    maxBounds: L.latLngBounds(municipio.bbox[0], municipio.bbox[1]),
    maxBoundsViscosity: 0.8,
    zoomControl: true
  });
  crearCapaBase().addTo(mapa);

  capaMunicipio = dibujarLimite(municipio);

  mapa.on('click', (evento) => {
    if (!modoElegir) return;
    modoElegir = false;
    mapa.getContainer().style.cursor = '';
    alElegirUbicacion?.(evento.latlng.lat, evento.latlng.lng);
  });

  return mapa;
}

function dibujarLimite(municipio) {
  if (capaMunicipio) mapa.removeLayer(capaMunicipio);
  return L.rectangle(L.latLngBounds(municipio.bbox[0], municipio.bbox[1]), {
    color: '#006657',
    weight: 2,
    opacity: 0.6,
    fillOpacity: 0.04,
    dashArray: '8,6',
    interactive: false
  }).addTo(mapa);
}

/** Dibuja los polígonos de zona y actualiza la leyenda del mapa. */
export function dibujarZonas(zonas = []) {
  if (!mapa) return;
  capasZonas.forEach((capa) => mapa.removeLayer(capa));
  capasZonas = [];

  zonas.forEach((zona) => {
    const poligono = L.polygon(zona.poligono, {
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
  return L.divIcon({
    className: 'marker-icon',
    html: `<div class="pin" style="background:${colorHex(incidencia.color)};">
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

export function centrarMunicipio(municipio) {
  mapa?.setView(municipio.center, municipio.zoom);
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
  if (!mapa) return;
  mapa.setView(municipio.center, municipio.zoom);
  mapa.setMaxBounds(L.latLngBounds(municipio.bbox[0], municipio.bbox[1]));
  capaMunicipio = dibujarLimite(municipio);
}

export function instancia() {
  return mapa;
}
