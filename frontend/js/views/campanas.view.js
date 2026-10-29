/**
 * Vista de campañas de promoción por correo.
 *
 * Solo el administrador la ve. Las suscripciones se captan desde la página
 * pública `/suscripcion`; aquí se revisan, se segmentan y se envían las campañas.
 */
import { $, esc, fmtFechaCorta } from '../core/utils.js';
import { CORREOS } from '../data/plantillas-publicidad.js';
import {
  aplicarEstilosData,
  aplicarTokens,
  construirCorreo,
  correoATexto,
  prepararVistaHtml
} from './diseno-publicidad.js';

const LIMITE_HTML = 20000;

const ETIQUETAS_ESTADO = {
  borrador: 'Borrador',
  enviando: 'Enviando…',
  enviada: 'Enviada',
  cancelada: 'Cancelada'
};

function estados(municipios = []) {
  return [...new Set(municipios.map((m) => m.estado))].sort((a, b) =>
    String(a).localeCompare(String(b), 'es')
  );
}

/** Texto legible del segmento; usa el catálogo cuando está disponible. */
export function etiquetaSegmento(segmento = {}, municipios = []) {
  if (segmento?.todos) return 'Todos los suscriptores';
  if (segmento?.municipioId) {
    const municipio = municipios.find((m) => String(m.id) === String(segmento.municipioId));
    return `Municipio ${municipio?.nombre || segmento.municipioId}`;
  }
  if (segmento?.estado) return `Estado ${segmento.estado}`;
  return 'Todos';
}

export function renderResumen(resumen) {
  const caja = $('campanasResumen');
  if (!caja) return;
  if (!resumen) {
    caja.innerHTML = '';
    return;
  }
  const { suscripciones = {}, campanas = {} } = resumen;
  caja.innerHTML = `
    <div class="monitoreo-kpi">
      <span class="monitoreo-kpi-num">${suscripciones.activas ?? 0}</span>
      <span class="monitoreo-kpi-label">Suscriptores activos</span>
    </div>
    <div class="monitoreo-kpi">
      <span class="monitoreo-kpi-num">${suscripciones.pendientes ?? 0}</span>
      <span class="monitoreo-kpi-label">Sin confirmar</span>
    </div>
    <div class="monitoreo-kpi">
      <span class="monitoreo-kpi-num">${suscripciones.bajas ?? 0}</span>
      <span class="monitoreo-kpi-label">Bajas</span>
    </div>
    <div class="monitoreo-kpi">
      <span class="monitoreo-kpi-num">${campanas.enviadas ?? 0}</span>
      <span class="monitoreo-kpi-label">Campañas enviadas</span>
    </div>
  `;
}

export function renderTabla(campanas = [], { municipios = [] } = {}) {
  const cuerpo = $('campanasBody');
  if (!cuerpo) return;
  if (!campanas.length) {
    cuerpo.innerHTML =
      '<tr><td colspan="6" class="vacio-suave u-centro">Todavía no hay campañas. Crea la primera.</td></tr>';
    return;
  }
  cuerpo.innerHTML = campanas
    .map((c) => {
      const estado = ETIQUETAS_ESTADO[c.estado] || c.estado;
      const segmento = esc(etiquetaSegmento(c.segmento, municipios));
      return `
        <tr>
          <td><strong>${esc(c.nombre)}</strong><div class="campana-sub">${esc(c.asunto)}</div></td>
          <td>${segmento}</td>
          <td><span class="inc-badge ${c.estado === 'enviada' ? 'badge-verde' : c.estado === 'borrador' ? 'badge-amarillo' : 'badge-vial'}">${estado}</span></td>
          <td>${c.total || 0}</td>
          <td>${c.enviados || 0}${c.errores ? ` · ${c.errores} err.` : ''}${
            c.total ? `<div class="pe-progreso"><i data-ancho="${Math.min(100, Math.round(((c.enviados || 0) + (c.errores || 0)) / c.total * 100))}"></i></div>` : ''
          }</td>
          <td class="campana-acciones">
            <button class="btn btn-sm btn-outline" data-action="campanas:editar" data-valor="${esc(c.id)}">
              <i class="bi bi-pencil-square"></i> Abrir
            </button>
            <button class="btn btn-sm btn-outline" data-action="campanas:duplicar" data-valor="${esc(c.id)}" title="Crear un borrador nuevo a partir de esta campaña" aria-label="Duplicar campaña">
              <i class="bi bi-copy"></i>
            </button>
          </td>
        </tr>`;
    })
    .join('');
  cuerpo.querySelectorAll('[data-ancho]').forEach((barra) => {
    barra.style.width = `${barra.dataset.ancho}%`;
  });
}

export function renderSuscripciones(lista = []) {
  const cuerpo = $('suscripcionesBody');
  if (!cuerpo) return;
  if (!lista.length) {
    cuerpo.innerHTML =
      '<tr><td colspan="4" class="vacio-suave u-centro">Aún no hay suscripciones registradas.</td></tr>';
    return;
  }
  cuerpo.innerHTML = lista
    .map(
      (s) => `
      <tr>
        <td>${esc(s.correo)}</td>
        <td>${esc(s.nombre || '—')}</td>
        <td>${esc(s.estado)}</td>
        <td>${s.creadoEn ? fmtFechaCorta(s.creadoEn) : '—'}</td>
      </tr>`
    )
    .join('');
}

const CAMPOS_PLANTILLA = [
  'campPlantilla',
  'campEstilo',
  'campColor',
  'campColor2',
  'campTitular',
  'campIntro',
  'campPuntos',
  'campBoton',
  'campEnlace'
];

export function renderPlantillasCorreo() {
  const selector = $('campPlantilla');
  if (!selector) return;
  const actual = selector.value;
  selector.innerHTML =
    '<option value="">— Sin plantilla (HTML propio) —</option>' +
    CORREOS.map((c) => `<option value="${esc(c.clave)}">${esc(c.nombre)}</option>`).join('');
  if ([...selector.options].some((o) => o.value === actual)) selector.value = actual;
}

/** Rellena los campos de la plantilla elegida (no toca el HTML ya escrito). */
export function cargarPlantilla(clave, { municipio = '' } = {}) {
  const t = CORREOS.find((c) => c.clave === clave);
  if (!t) return null;
  $('campEstilo').value = t.estilo;
  $('campTitular').value = aplicarTokens(t.titular, municipio);
  $('campIntro').value = aplicarTokens(t.intro, municipio);
  $('campPuntos').value = aplicarTokens(t.puntos, municipio);
  $('campBoton').value = t.boton;
  $('campEnlace').value = `${window.location.origin}${t.ruta}`;
  return { ...t, asunto: aplicarTokens(t.asunto, municipio) };
}

export function valoresPlantilla() {
  return {
    estilo: $('campEstilo')?.value || 'lista',
    color: $('campColor')?.value || '#006657',
    color2: $('campColor2')?.value || '#0f3d3a',
    titular: $('campTitular')?.value.trim() || '',
    intro: $('campIntro')?.value || '',
    puntos: $('campPuntos')?.value || '',
    boton: $('campBoton')?.value.trim() || '',
    enlace: $('campEnlace')?.value.trim() || ''
  };
}

export function contadorHtml() {
  const largo = ($('campHtml')?.value || '').length;
  const caja = $('campHtmlContador');
  if (!caja) return largo;
  caja.textContent = `${largo.toLocaleString('es-MX')} / ${LIMITE_HTML.toLocaleString('es-MX')} caracteres`;
  caja.classList.toggle('excede', largo > LIMITE_HTML * 0.9);
  return largo;
}

/** Genera HTML y texto plano desde los campos de la plantilla. */
export function aplicarPlantilla() {
  const datos = valoresPlantilla();
  const html = construirCorreo(datos);
  $('campHtml').value = html;
  $('campTexto').value = correoATexto(datos);
  $('campHtml').dataset.autogenerado = 'si';
  actualizarPreview();
  return html.length;
}

export function marcarHtmlManual() {
  const campo = $('campHtml');
  if (campo) campo.dataset.autogenerado = '';
}

export function htmlEsAutogenerado() {
  return $('campHtml')?.dataset.autogenerado === 'si';
}

/** Cambia entre vista de escritorio y de celular. */
export function modoVista(modo = 'escritorio') {
  $('campPreviewMarco')?.classList.toggle('movil', modo === 'movil');
  document.querySelectorAll('[data-action="campanas:vista"]').forEach((boton) => {
    boton.classList.toggle('activo', boton.dataset.valor === modo);
  });
}

/** Prepara el modal con una campaña existente, una copia o una vacía. */
export function prepararModal({ campana = null, municipios = [], copia = false } = {}) {
  $('campId').value = campana?.id || '';
  $('campNombre').value = campana?.nombre || '';
  $('campAsunto').value = campana?.asunto || '';
  $('campHtml').value = campana?.html || '';
  $('campHtml').dataset.autogenerado = '';
  $('campTexto').value = campana?.texto || '';

  const listaEstados = estados(municipios);
  $('campSegmentoEstado').innerHTML =
    '<option value="">— Elige un estado —</option>' +
    listaEstados.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join('');
  $('campSegmentoMunicipio').innerHTML =
    '<option value="">— Elige un municipio —</option>' +
    municipios
      .slice()
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
      .map((m) => `<option value="${esc(m.id)}">${esc(m.nombre)} (${esc(m.estado)})</option>`)
      .join('');

  const segmento = campana?.segmento || { todos: true };
  $('campSegmentoTipo').value = segmento.municipioId
    ? 'municipio'
    : segmento.estado
      ? 'estado'
      : 'todos';
  $('campSegmentoMunicipio').value = segmento.municipioId || '';
  $('campSegmentoEstado').value = segmento.estado || '';
  actualizarSegmento();

  renderPlantillasCorreo();
  $('campPlantilla').value = '';
  $('campEstilo').value = 'lista';
  $('campColor').value = '#006657';
  $('campColor2').value = '#0f3d3a';
  for (const id of ['campTitular', 'campIntro', 'campPuntos', 'campBoton', 'campEnlace']) {
    $(id).value = '';
  }
  const cajaHtml = $('campHtmlBox');
  if (cajaHtml) cajaHtml.open = Boolean(campana?.html);
  modoVista('escritorio');
  actualizarPreview();

  const soloLectura = Boolean(campana && campana.estado !== 'borrador');
  for (const id of [
    'campNombre',
    'campAsunto',
    'campHtml',
    'campTexto',
    'campSegmentoTipo',
    'campSegmentoMunicipio',
    'campSegmentoEstado',
    ...CAMPOS_PLANTILLA
  ]) {
    const campo = $(id);
    if (campo) campo.disabled = soloLectura;
  }
  document.querySelectorAll('[data-solo-borrador]').forEach((el) => {
    el.classList.toggle('u-oculto', soloLectura);
  });
  $('modalCampanaTitle').textContent = soloLectura
    ? 'Campaña enviada (solo lectura)'
    : copia
      ? 'Nueva campaña (copia)'
      : campana?.id
        ? 'Editar campaña'
        : 'Nueva campaña';
  $('btnCampEnviar').classList.toggle('u-oculto', !campana?.id || soloLectura);
  $('btnCampPrueba').classList.toggle('u-oculto', !campana?.id);
  document
    .querySelector('[data-action="campanas:guardar"]')
    ?.classList.toggle('u-oculto', soloLectura);
}

/** Muestra el selector que corresponde al segmento elegido. */
export function actualizarSegmento() {
  const tipo = $('campSegmentoTipo')?.value || 'todos';
  $('campMunicipioBox')?.classList.toggle('u-oculto', tipo !== 'municipio');
  $('campEstadoBox')?.classList.toggle('u-oculto', tipo !== 'estado');
}

/**
 * Actualiza la vista previa. Los estilos en línea del correo no pueden ir en
 * atributos (CSP), así que se limpian y se aplican por CSSOM: la vista previa
 * sí refleja el diseño real del mensaje.
 */
export function actualizarPreview() {
  const html = $('campHtml')?.value || '';
  const caja = $('campPreview');
  if (!caja) return;
  caja.innerHTML = prepararVistaHtml(html);
  aplicarEstilosData(caja);
  $('campPreviewVacia')?.classList.toggle('u-oculto', Boolean(html.trim()));
  contadorHtml();
}

export function valoresForm() {
  const tipo = $('campSegmentoTipo')?.value || 'todos';
  const segmento = { todos: tipo === 'todos' };
  if (tipo === 'municipio') segmento.municipioId = $('campSegmentoMunicipio')?.value || '';
  if (tipo === 'estado') segmento.estado = $('campSegmentoEstado')?.value || '';
  return {
    id: $('campId')?.value || '',
    nombre: $('campNombre')?.value.trim() || '',
    asunto: $('campAsunto')?.value.trim() || '',
    html: $('campHtml')?.value || '',
    texto: $('campTexto')?.value || '',
    segmento
  };
}
