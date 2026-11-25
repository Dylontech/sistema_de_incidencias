/** Vista del catálogo administrativo de vialidades. */
import { $, esc, fmtFechaCorta } from '../core/utils.js';

const ETIQUETA_CONDICION = {
  bueno: 'Bueno',
  leve: 'Leve',
  regular: 'Regular',
  malo: 'Malo',
  critico: 'Crítico',
  sin_reportes: 'Sin reportes',
  sin_datos: 'Sin datos'
};

const CLASE_CONDICION = {
  bueno: 'badge-verde',
  leve: 'badge-amarillo',
  regular: 'badge-naranja',
  malo: 'badge-rojo',
  critico: 'badge-negro',
  sin_reportes: 'badge-verde',
  sin_datos: 'badge-gris'
};

function etiquetaDe(lista = [], clave, respaldo = '—') {
  return lista.find((item) => item.clave === clave)?.etiqueta || respaldo;
}

function municipioNombre(municipios = [], id) {
  return municipios.find((municipio) => String(municipio.id) === String(id))?.nombre || id || '—';
}

function googleMaps(via, municipios = []) {
  if (via.googleMapsUrl && /^https?:\/\//i.test(via.googleMapsUrl)) return via.googleMapsUrl;
  const consulta = `${via.nombre || via.clave || 'vialidad'} ${municipioNombre(municipios, via.municipioId)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}

function condicionHtml(condicion) {
  if (!condicion) {
    return '<span class="inc-badge badge-gris">Sin datos</span>';
  }
  const clave = condicion.estado || 'sin_datos';
  return `<span class="inc-badge ${CLASE_CONDICION[clave] || 'badge-gris'}">${esc(
    condicion.etiqueta || ETIQUETA_CONDICION[clave] || clave
  )}</span><div class="campo-nota">${esc(String(condicion.indice ?? '—'))}/100 · ${esc(
    String(condicion.total ?? 0)
  )} reporte(s)</div>`;
}

export function renderResumen(datos = {}) {
  const contenedor = $('vialidadesResumen');
  if (!contenedor) return;
  const resumen = datos.resumen || {};
  const partes = [
    `${resumen.total || 0} vialidad(es)`,
    `${resumen.conReportes || 0} con reportes`,
    `${resumen.sinReportes || 0} sin reportes`,
    `${resumen.sinVerificar || 0} sin verificar`,
    `${resumen.desactualizadas || 0} desactualizada(s)`
  ];
  contenedor.textContent = partes.join(' · ');
}

export function renderLista(datos = {}, { municipios = [], tipos = [], fuentes = [] } = {}) {
  const contenedor = $('vialidadesLista');
  if (!contenedor) return;
  renderResumen(datos);
  const lista = datos.vialidades || [];
  if (!lista.length) {
    contenedor.innerHTML =
      '<div class="empty-state"><i class="bi bi-signpost-split"></i><p>No hay vialidades con esos filtros. Crea una o importa un archivo de Google Maps/GeoJSON.</p></div>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr>
          <th>Vialidad</th><th>Tipo</th><th>Origen</th><th>Condición</th>
          <th>Verificada</th><th>Actualizada</th><th>Acciones</th>
        </tr></thead>
        <tbody>
          ${lista
            .map(
              (via) => `<tr>
                <td>
                  <strong>${esc(via.nombre || 'Sin nombre')}</strong>
                  <div class="campo-nota">${esc(via.clave || '—')}${
                    via.notas ? ` · ${esc(String(via.notas).slice(0, 90))}` : ''
                  }</div>
                </td>
                <td class="u-fs-12px">${esc(etiquetaDe(tipos, via.tipo, via.tipo || '—'))}${via.anchoM ? `<div class="campo-nota">${esc(String(via.anchoM))} m</div>` : ''}</td>
                <td class="u-fs-12px">${esc(etiquetaDe(fuentes, via.fuente, via.fuente || '—'))}</td>
                <td>${condicionHtml(via.condicion)}</td>
                <td class="u-fs-11px">
                  ${
                    via.verificadaEn
                      ? `${esc(fmtFechaCorta(via.verificadaEn))}<div class="campo-nota">${esc(
                          via.verificadaPor || '—'
                        )}</div>`
                      : '<span class="inc-badge badge-amarillo">Pendiente</span>'
                  }
                </td>
                <td class="u-fs-11px">
                  ${esc(fmtFechaCorta(via.actualizadoEn))}
                  ${
                    via.desactualizada
                      ? '<div class="campo-nota u-texto-rojo">Requiere revisión</div>'
                      : ''
                  }
                </td>
                <td class="archivo-acciones">
                  <a class="btn btn-sm btn-outline" href="${esc(googleMaps(via, municipios))}"
                     target="_blank" rel="noopener noreferrer"><i class="bi bi-geo-alt"></i> Maps</a>
                  <button class="btn btn-sm btn-outline" data-action="vialidades:verificar"
                          data-id="${esc(via.id)}"><i class="bi bi-check2-circle"></i> Verificar</button>
                  <button class="btn btn-sm btn-outline" data-action="vialidades:editar"
                          data-id="${esc(via.id)}"><i class="bi bi-pencil"></i> Editar</button>
                  <button class="btn btn-sm btn-outline" data-action="vialidades:eliminar"
                          data-id="${esc(via.id)}"><i class="bi bi-archive"></i> Archivar</button>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

export function renderMunicipios(municipios = [], activo = '') {
  const filtro = $('vialidadesMunicipioFiltro');
  if (filtro) {
    filtro.innerHTML = municipios
      .map(
        (municipio) =>
          `<option value="${esc(municipio.id)}" ${
            String(municipio.id) === String(activo) ? 'selected' : ''
          }>${esc(municipio.nombre)} — ${esc(municipio.estado)}</option>`
      )
      .join('');
  }
}

export function prepararModal(via = null, { municipios = [], municipioActivo = '', tipos = [], fuentes = [] } = {}) {
  const titulo = $('vialidadTitulo');
  if (titulo) titulo.textContent = via ? 'Editar vialidad' : 'Nueva vialidad';
  const id = $('vialidadId');
  const municipio = $('vialidadMunicipio');
  const tipo = $('vialidadTipo');
  const fuente = $('vialidadFuente');
  const nombre = $('vialidadNombre');
  const clave = $('vialidadClave');
  const maps = $('vialidadGoogleMaps');
  const notas = $('vialidadNotas');
  const ancho = $('vialidadAncho');
  const geometria = $('vialidadGeometria');
  const eje = $('vialidadEje');
  if (id) id.value = via?.id || '';
  if (municipio) {
    municipio.innerHTML = municipios.map((item) =>
      `<option value="${esc(item.id)}">${esc(item.nombre)} — ${esc(item.estado)}</option>`
    ).join('');
    municipio.value = via?.municipioId || municipioActivo || '';
  }
  if (nombre) nombre.value = via?.nombre || '';
  if (clave) clave.value = via?.clave || '';
  if (tipo) {
    tipo.innerHTML = tipos
      .map(
        (item) =>
          `<option value="${esc(item.clave)}" ${
            item.clave === (via?.tipo || 'calle') ? 'selected' : ''
          }>${esc(item.etiqueta)}</option>`
      )
      .join('');
  }
  if (fuente) {
    fuente.innerHTML = fuentes
      .map(
        (item) =>
          `<option value="${esc(item.clave)}" ${
            item.clave === (via?.fuente || 'manual') ? 'selected' : ''
          }>${esc(item.etiqueta)}</option>`
      )
      .join('');
  }
  if (maps) maps.value = via?.googleMapsUrl || '';
  if (notas) notas.value = via?.notas || '';
  if (ancho) ancho.value = via?.anchoM ?? '';
  if (geometria) geometria.value = via?.geometria ? JSON.stringify(via.geometria) : '';
  if (eje) eje.value = via?.eje ? JSON.stringify(via.eje) : '';
  const editable = !via || permiteEditarExtremos(via.geometria, via.eje);
  for (const campo of ['vialidadLngInicio', 'vialidadLatInicio', 'vialidadLngFin', 'vialidadLatFin']) {
    const elemento = $(campo);
    if (elemento) {
      elemento.readOnly = !editable;
      elemento.required = editable;
    }
  }
  const ayuda = $('vialidadGeometriaNota');
  if (ayuda) ayuda.textContent = editable
    ? 'Captura el inicio y el fin. Al moverlos se conservan los puntos intermedios. Los cambios de texto conservan el trazado completo.'
    : 'Este trazado conserva su forma importada. Las coordenadas son de consulta; para modificar su forma, importa un archivo actualizado.';
  const camino = coordenadasDeGeometria(via?.eje || via?.geometria);
  const inicio = camino[0] || [];
  const fin = camino[camino.length - 1] || [];
  const asignar = (campo, valor) => {
    const elemento = document.getElementById(campo);
    if (elemento) elemento.value = Number.isFinite(Number(valor)) ? valor : '';
  };
  asignar('vialidadLngInicio', inicio[0]);
  asignar('vialidadLatInicio', inicio[1]);
  asignar('vialidadLngFin', fin[0]);
  asignar('vialidadLatFin', fin[1]);
}

/** Extrae una línea [lng, lat] de cualquier geometría compatible. */
function coordenadasDeGeometria(valor) {
  if (Array.isArray(valor)) return valor;
  if (!valor || typeof valor !== 'object') return [];
  if (valor.type === 'LineString') return valor.coordinates || [];
  if (valor.type === 'MultiLineString') return valor.coordinates?.[0] || [];
  if (valor.type === 'Polygon') return valor.coordinates?.[0] || [];
  if (valor.type === 'MultiPolygon') return valor.coordinates?.[0]?.[0] || [];
  if (Array.isArray(valor.coordinates)) return valor.coordinates;
  return [];
}

export function geometriaDeFormulario(original, lngInicio, latInicio, lngFin, latFin) {
  const puntos = coordenadasDeGeometria(original);
  const sinCambios =
    puntos.length >= 2 &&
    Number(puntos[0]?.[0]) === lngInicio &&
    Number(puntos[0]?.[1]) === latInicio &&
    Number(puntos.at(-1)?.[0]) === lngFin &&
    Number(puntos.at(-1)?.[1]) === latFin;
  if (![lngInicio, latInicio, lngFin, latFin].every(Number.isFinite)) {
    throw new Error('Completa las cuatro coordenadas del tramo');
  }
  if (Math.abs(lngInicio) > 180 || Math.abs(lngFin) > 180 ||
      Math.abs(latInicio) > 90 || Math.abs(latFin) > 90) {
    throw new Error('Las coordenadas están fuera de rango');
  }
  const nuevos = [[lngInicio, latInicio], ...puntos.slice(1, -1), [lngFin, latFin]];
  if (!nuevos.some(([lng, lat]) => lng !== lngInicio || lat !== latInicio)) {
    throw new Error('El tramo debe tener longitud mayor que cero');
  }
  if (sinCambios) return original;
  return nuevos;
}

function permiteEditarExtremos(geometria, eje) {
  if (['MultiPolygon', 'MultiLineString'].includes(geometria?.type)) return false;
  const linea = eje || geometria;
  return linea?.type === 'LineString' || (Array.isArray(linea) &&
    (!linea.length || !Array.isArray(linea[0]?.[0])));
}

export function leerFormulario() {
  const valor = (id) => document.getElementById(id)?.value?.trim() || '';
  const numero = (id) => {
    const texto = valor(id);
    return texto === '' ? null : Number(texto);
  };
  const lngInicio = numero('vialidadLngInicio');
  const latInicio = numero('vialidadLatInicio');
  const lngFin = numero('vialidadLngFin');
  const latFin = numero('vialidadLatFin');
  let original = [];
  try {
    original = JSON.parse(valor('vialidadGeometria') || '[]');
  } catch {
    original = [];
  }
  let ejeOriginal = null;
  try {
    ejeOriginal = JSON.parse(valor('vialidadEje') || 'null');
  } catch {
    ejeOriginal = null;
  }
  const referencia = ejeOriginal || original;
  const editable = permiteEditarExtremos(original, ejeOriginal);
  const geometria = editable ? geometriaDeFormulario(
    referencia,
    lngInicio,
    latInicio,
    lngFin,
    latFin
  ) : referencia;
  const sinCambios = geometria === referencia;
  let eje = sinCambios ? ejeOriginal : null;
  let geometriaFinal = sinCambios ? original : geometria;
  if (!sinCambios && Array.isArray(geometria)) {
    eje = { type: 'LineString', coordinates: geometria };
    geometriaFinal = eje;
  }
  const anchoM = numero('vialidadAncho');
  if (anchoM !== null && (!Number.isFinite(anchoM) || anchoM < 2 || anchoM > 60)) {
    throw new Error('El ancho de calzada debe estar entre 2 y 60 metros');
  }
  return {
    id: valor('vialidadId'),
    municipioId: valor('vialidadMunicipio'),
    nombre: valor('vialidadNombre'),
    clave: valor('vialidadClave'),
    tipo: valor('vialidadTipo'),
    fuente: valor('vialidadFuente'),
    anchoM,
    googleMapsUrl: valor('vialidadGoogleMaps'),
    notas: valor('vialidadNotas'),
    geometria: geometriaFinal,
    eje
  };
}
