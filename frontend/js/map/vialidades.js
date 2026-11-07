/**
 * Capa Leaflet de la red vial real.
 *
 * Cada vialidad se dibuja como polígono de calzada (o como línea sólida muy
 * gruesa si un dato antiguo aún no tiene polígono). Los subtramos reciben el
 * color del semáforo. No se dibujan uniones heurísticas entre incidencias.
 */
import { $, esc, aplicarEstilosDinamicos } from '../core/utils.js';
import { anillosDe } from '../core/geocerca.js';

let mapa = null;
let grupo = null;
let visible = false;
let ultimosDatos = null;
let ultimasZonas = [];

function crearGrupo() {
  if (!mapa) return null;
  if (!grupo) grupo = L.layerGroup();
  return grupo;
}

function etiqueta(via, segmento = null) {
  const indice = segmento?.indice ?? via.indice;
  const estado = segmento?.etiqueta || via.etiqueta || 'Sin datos';
  const total = segmento?.total ?? via.total ?? 0;
  const fuente = String(via.fuente || '').toLowerCase();
  const atribucion = fuente.includes('openstreetmap')
    ? '<br><span class="u-fs-10px">© OpenStreetMap contributors</span>'
    : '';
  return `<strong>${esc(via.nombre || 'Vialidad')}</strong><br>
    <span class="u-capitalizar">${esc(estado)}</span> · ${esc(
      indice === null || indice === undefined ? 'sin datos' : `${indice}/100`
    )}<br>
    ${esc(String(total))} reporte${Number(total) === 1 ? '' : 's'}${
      via.anchoM ? ` · ${esc(String(via.anchoM))} m` : ''
    }${atribucion}`;
}

function agregarTooltip(capa, via, segmento = null) {
  capa.bindTooltip(etiqueta(via, segmento), { sticky: true });
  capa.options.interactive = true;
}

function agregarPoligono(contenedor, geometria, via, segmento = null) {
  const color = segmento?.color || via.color || '#94a3b8';
  const capa = L.geoJSON(geometria, {
    style: () => ({
      color: '#0f172a',
      weight: 0.9,
      opacity: 0.9,
      fillColor: color,
      fillOpacity: 0.9
    })
  });
  capa.eachLayer((item) => agregarTooltip(item, via, segmento));
  contenedor.addLayer(capa);
  return capa;
}

function agregarLinea(contenedor, linea, via, segmento = null) {
  const puntos = linea.map(([lng, lat]) => [lat, lng]);
  if (puntos.length < 2) return null;
  const base = L.polyline(puntos, {
    color: '#0f172a',
    weight: 12,
    opacity: 0.85,
    lineCap: 'round',
    lineJoin: 'round'
  });
  const color = segmento?.color || via.color || '#94a3b8';
  const relleno = L.polyline(puntos, {
    color,
    weight: 8,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round'
  });
  agregarTooltip(base, via, segmento);
  agregarTooltip(relleno, via, segmento);
  contenedor.addLayer(base);
  contenedor.addLayer(relleno);
  return relleno;
}

function agregarGeometria(contenedor, geometria, via, segmento = null) {
  if (!geometria) return;
  if (['Polygon', 'MultiPolygon'].includes(geometria.type)) {
    agregarPoligono(contenedor, geometria, via, segmento);
    return;
  }
  if (['LineString', 'MultiLineString'].includes(geometria.type)) {
    const lineas =
      geometria.type === 'LineString' ? [geometria.coordinates] : geometria.coordinates;
    lineas.forEach((linea) => agregarLinea(contenedor, linea, via, segmento));
    return;
  }
  if (Array.isArray(geometria)) {
    agregarLinea(contenedor, geometria, via, segmento);
  }
}

function pintarTramos(datos) {
  const capa = crearGrupo();
  if (!capa) return;
  // Las vialidades críticas se pintan al final para quedar encima en cruces.
  [...(datos?.vias || [])]
    .sort((a, b) => (a.indice ?? 0) - (b.indice ?? 0))
    .forEach((via) => {
    if (Array.isArray(via.segmentos) && via.segmentos.length) {
      via.segmentos.forEach((segmento) =>
        agregarGeometria(capa, segmento.geometria, via, segmento)
      );
      return;
    }
    if (via.geometria) {
      agregarGeometria(capa, via.geometria, via);
      return;
    }
    // Compatibilidad con filas antiguas: camino [lat, lng] sin polígono.
    if (Array.isArray(via.camino) && via.camino.length >= 2) {
      agregarLinea(
        capa,
        via.camino.map(([lat, lng]) => [lng, lat]),
        via
      );
    }
  });
}

function pintarZonas(datos, zonas = []) {
  const capa = crearGrupo();
  if (!capa || !zonas.length) return;
  const calor = new Map((datos?.zonas || []).map((zona) => [String(zona.zonaId || zona.nombre), zona]));
  zonas.forEach((zona) => {
    const puntaje = calor.get(String(zona.id)) || calor.get(String(zona.nombre));
    if (!puntaje || puntaje.indice === null || puntaje.indice === undefined) return;
    const poligono = L.polygon(anillosDe(zona.poligono), {
      color: puntaje.color,
      fillColor: puntaje.color,
      fillOpacity: 0.16,
      weight: 1,
      opacity: 0.55
    });
    poligono.bindTooltip(
      `<strong>${esc(puntaje.nombre || zona.nombre)}</strong><br>
       ${esc(puntaje.etiqueta)} · ${esc(String(puntaje.indice))}/100 · ${esc(
         String(puntaje.total || 0)
       )} reporte(s)`,
      { sticky: true }
    );
    capa.addLayer(poligono);
  });
}

function rangosDeEscala(escala = []) {
  const niveles = [...escala].sort((a, b) => Number(a.desde) - Number(b.desde));
  return niveles.map((nivel, indice) => ({
    ...nivel,
    hasta: indice === niveles.length - 1 ? 100 : Number(niveles[indice + 1].desde) - 1
  }));
}

function pintarLeyenda(datos) {
  const contenedor = $('legendVialidades');
  if (!contenedor) return;
  if (!datos) {
    contenedor.innerHTML = '<div class="u-fs-11px u-suave">Enciende la capa para ver la red vial real.</div>';
    return;
  }
  const resumen = datos.resumen || {};
  const escala = datos.escala || [];
  const aviso = datos.sinRedReal
    ? `<div class="campo-nota u-texto-rojo u-mb-6">${esc(
        datos.aviso || 'No hay red vial real importada para este municipio.'
      )}</div>`
    : '';
  contenedor.innerHTML = `${aviso}
    ${rangosDeEscala(escala)
      .map(
        (nivel) => `<div class="legend-item">
          <div class="legend-color" data-fondo="${esc(nivel.color)}"></div>
          ${esc(nivel.etiqueta)} · ${esc(String(nivel.desde))}–${esc(String(nivel.hasta))}
        </div>`
      )
      .join('')}
    <div class="u-fs-11px u-suave u-mt-6">
      ${esc(String(resumen.vias || 0))} vialidad(es) reales ·
      ${esc(String(resumen.conReportes || 0))} con reportes ·
      ${esc(String(resumen.sinReportes || 0))} sin reportes ·
      ${esc(String(resumen.criticas || 0))} crítica(s)
    </div>`;
  aplicarEstilosDinamicos(contenedor);
}

/** Dibuja los datos recibidos del endpoint y actualiza la leyenda. */
export function dibujar(datos, zonas = []) {
  ultimosDatos = datos;
  ultimasZonas = zonas;
  const capa = crearGrupo();
  if (!capa) return;
  capa.clearLayers();
  // Las zonas van primero para que el semáforo vial quede encima.
  pintarZonas(datos, zonas);
  pintarTramos(datos);
  pintarLeyenda(datos);
  if (visible && !mapa.hasLayer(capa)) capa.addTo(mapa);
}

/** Enciende o apaga la capa; al encender siempre se refrescan los datos. */
export function alternar() {
  if (!mapa) return { visible: false, necesitaDatos: false };
  const capa = crearGrupo();
  visible = !visible;
  if (visible) {
    if (ultimosDatos) dibujar(ultimosDatos, ultimasZonas);
    capa.addTo(mapa);
  } else if (mapa.hasLayer(capa)) {
    mapa.removeLayer(capa);
  }
  return { visible, necesitaDatos: visible };
}

export function estaVisible() {
  return visible;
}

/** Borra la caché para forzar una consulta nueva después de importar. */
export function invalidar() {
  ultimosDatos = null;
  ultimasZonas = [];
}

/** Borra la capa al cambiar de municipio y deja el control apagado. */
export function limpiar() {
  ultimosDatos = null;
  ultimasZonas = [];
  visible = false;
  if (grupo) {
    grupo.clearLayers();
    if (mapa?.hasLayer(grupo)) mapa.removeLayer(grupo);
  }
  const boton = $('btnVialidades');
  if (boton) {
    boton.setAttribute('aria-pressed', 'false');
    const texto = $('btnVialidadesTexto');
    if (texto) texto.textContent = 'Mostrar semáforo vial';
  }
  pintarLeyenda(null);
}

/** Prepara la capa sobre una instancia de Leaflet ya creada. */
export function inicializar(instancia) {
  mapa = instancia;
  crearGrupo();
}
