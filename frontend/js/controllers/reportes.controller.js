/**
 * Controlador de informes, exportaciones e importación del respaldo anterior.
 *
 * V2.12 — Diseño del informe
 *   · Los campos del diseño se describen en una sola tabla (CAMPOS_DISENO): se cargan,
 *     se leen y se restablecen con el mismo código, y cada número se acota a su rango
 *     (antes un valor escrito a mano podía salirse de min/max o caer al valor por defecto).
 *   · Opciones nuevas: color institucional, tamaño y orden de la evidencia.
 *   · «Guardar diseño» tolera servidores que todavía no conocen las claves nuevas:
 *     guarda las anteriores y avisa, en lugar de perder el trabajo del administrador.
 *   · Correcciones: la caché de estadísticas se invalida tras limpiar o importar, «Restablecer
 *     datos» ya no consulta dos veces, los nombres de archivo usan la fecha local y los
 *     desplegables escapan el texto que reciben.
 */
import { registrarAcciones } from '../core/eventos.js';
import { $, descargar } from '../core/utils.js';
import { abrirModal, cerrarModal, loading, preguntar, toast } from '../core/ui.js';
import { intentar, mensajeDeError } from '../core/errores.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { statsService } from '../services/stats.service.js';
import { configuracionService } from '../services/configuracion.service.js';
import * as aplicacion from '../core/aplicacion.js';
import * as reportesView from '../views/reportes.view.js';
import { elegirVersionPdf } from './versionPdf.controller.js';

function valorConfig(configuracion, clave, porDefecto = '') {
  return configuracion.find((fila) => fila.clave === clave)?.valor ?? porDefecto;
}

function pintarLogo(url) {
  const imagen = $('reporteLogoPreview');
  const vacio = $('reporteLogoVacio');
  const campoUrl = $('reporteLogoUrl');
  if (campoUrl) campoUrl.value = url || '';
  if (imagen) {
    imagen.hidden = !url;
    if (url) imagen.src = url;
    else imagen.removeAttribute('src');
  }
  if (vacio) vacio.hidden = Boolean(url);
}

function posicionarLogoDemo() {
  const imagen = $('reporteLogoPreview');
  const x = Number($('reporteLogoX')?.value) || 0;
  const y = Number($('reporteLogoY')?.value) || 0;
  if (!imagen || imagen.hidden) return;
  imagen.style.left = `${Math.max(0, 10 + x)}px`;
  imagen.style.top = `${Math.max(0, 10 + y)}px`;
}

function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Fecha local AAAA-MM-DD. `toISOString()` usa UTC: de noche en México daría el día siguiente. */
function fechaLocal(fecha = new Date()) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/** Convierte a entero dentro de [min, max]; si no es un número válido, usa el valor por defecto. */
function acotar(valor, min, max, porDefecto) {
  if (valor === '' || valor === null || valor === undefined) return porDefecto;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return porDefecto;
  return Math.min(max, Math.max(min, Math.round(numero)));
}

/**
 * Campos del diseño del informe: clave de configuración ↔ elemento del formulario.
 * Los mismos valores recomendados y límites los usan el PDF del servidor (pdf-informes.mjs)
 * y la hoja imprimible (impresion-informe.css). `nueva: true` marca las claves de la V2.12.
 */
const CAMPOS_DISENO = [
  { clave: 'informes.logo_posicion', id: 'reporteLogoPosicion', defecto: 'izquierda', validos: ['izquierda', 'derecha', 'centro'] },
  { clave: 'informes.logo_ancho', id: 'reporteLogoAncho', defecto: 90, min: 30, max: 220 },
  { clave: 'informes.logo_desplazamiento_x', id: 'reporteLogoX', defecto: 0, min: -120, max: 120 },
  { clave: 'informes.logo_desplazamiento_y', id: 'reporteLogoY', defecto: 0, min: -80, max: 80 },
  // Márgenes mínimos: por debajo, la impresora recorta y no cabe el pie con «Página X de Y».
  { clave: 'informes.margen_superior', id: 'reporteMargenSuperior', defecto: 18, min: 12, max: 50 },
  { clave: 'informes.margen_derecho', id: 'reporteMargenDerecho', defecto: 15, min: 10, max: 50 },
  { clave: 'informes.margen_inferior', id: 'reporteMargenInferior', defecto: 18, min: 14, max: 50 },
  { clave: 'informes.margen_izquierdo', id: 'reporteMargenIzquierdo', defecto: 15, min: 10, max: 50 },
  { clave: 'informes.pie_texto', id: 'reportePieTexto', defecto: 'Sistema de Incidencias Municipales', texto: true, max: 160 },
  { clave: 'informes.color_acento', id: 'reporteColorAcento', defecto: '#006657', color: true, nueva: true },
  { clave: 'informes.evidencia_columnas', id: 'reporteEvidenciaColumnas', defecto: 2, validos: [1, 2, 3], nueva: true },
  { clave: 'informes.evidencia_posicion', id: 'reporteEvidenciaPosicion', defecto: 'final', validos: ['final', 'despues_descripcion'], nueva: true }
];

const CLAVES_NUEVAS = new Set(CAMPOS_DISENO.filter((campo) => campo.nueva).map((campo) => campo.clave));

/** Valida un valor crudo (del formulario o de la configuración) según el tipo de campo. */
function normalizarCampo(campo, crudo) {
  if (campo.validos) {
    const valido = campo.validos.find((v) => String(v) === String(crudo ?? ''));
    return valido !== undefined ? valido : campo.defecto;
  }
  if (campo.color) {
    const hex = String(crudo ?? '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(hex) ? hex : campo.defecto;
  }
  if (campo.texto) return String(crudo ?? '').trim().slice(0, campo.max);
  return acotar(crudo, campo.min, campo.max, campo.defecto);
}

async function cargarDiseno() {
  const panel = $('reporteDisenoPanel');
  if (!panel || !sesion.esAdmin()) return;
  panel.hidden = false;
  try {
    const { configuracion } = await configuracionService.listar();
    const logo = valorConfig(configuracion, 'informes.logo_url');
    for (const campo of CAMPOS_DISENO) {
      const elemento = $(campo.id);
      if (elemento) elemento.value = normalizarCampo(campo, valorConfig(configuracion, campo.clave, campo.defecto));
    }
    pintarLogo(logo);
    posicionarLogoDemo();
  } catch (error) {
    toast(mensajeDeError(error), 'err');
  }
}

/** Arrastrar el logo cambia sus ajustes finos dentro del documento. */
function prepararArrastreLogo() {
  const imagen = $('reporteLogoPreview');
  if (!imagen || imagen.dataset.arrastre === '1') return;
  imagen.dataset.arrastre = '1';
  let inicio = null;
  imagen.addEventListener('pointerdown', (evento) => {
    inicio = {
      x: evento.clientX,
      y: evento.clientY,
      baseX: Number($('reporteLogoX')?.value) || 0,
      baseY: Number($('reporteLogoY')?.value) || 0
    };
    imagen.setPointerCapture?.(evento.pointerId);
    imagen.style.cursor = 'grabbing';
  });
  imagen.addEventListener('pointermove', (evento) => {
    if (!inicio) return;
    const x = Math.max(-120, Math.min(120, inicio.baseX + evento.clientX - inicio.x));
    const y = Math.max(-80, Math.min(80, inicio.baseY + evento.clientY - inicio.y));
    if ($('reporteLogoX')) $('reporteLogoX').value = Math.round(x);
    if ($('reporteLogoY')) $('reporteLogoY').value = Math.round(y);
    posicionarLogoDemo();
  });
  const soltar = () => {
    inicio = null;
    imagen.style.cursor = 'grab';
  };
  imagen.addEventListener('pointerup', soltar);
  imagen.addEventListener('pointercancel', soltar);
}

/**
 * Lee el formulario y devuelve las claves de configuración ya validadas. Un campo que no
 * exista en el HTML (p. ej. un index.html anterior) se omite: no se pisa su valor guardado.
 */
function leerDiseno() {
  const diseno = { 'informes.logo_url': $('reporteLogoUrl')?.value || '' };
  for (const campo of CAMPOS_DISENO) {
    const elemento = $(campo.id);
    if (elemento) diseno[campo.clave] = normalizarCampo(campo, elemento.value);
  }
  return diseno;
}

/**
 * Guarda el diseño. Si el servidor valida las claves permitidas y aún no conoce las nuevas,
 * guarda solo las anteriores. Devuelve true si se guardó todo, false si faltaron las nuevas.
 */
async function guardarDiseno() {
  const diseno = leerDiseno();
  try {
    await configuracionService.guardar(diseno);
    return true;
  } catch (error) {
    if (!Object.keys(diseno).some((clave) => CLAVES_NUEVAS.has(clave))) throw error;
    const anteriores = Object.fromEntries(Object.entries(diseno).filter(([clave]) => !CLAVES_NUEVAS.has(clave)));
    await configuracionService.guardar(anteriores);
    return false;
  }
}

async function datosDeExportacion() {
  const datos = await statsService.exportacion();
  store.actualizar({ exportacion: datos }, 'exportacion');
  return datos;
}

/* ------------------------ constructor de informes ------------------------ */

let informesCache = { datos: null, momento: 0 };

function estadosDisponibles() {
  return [...new Set((store.estado.municipios || []).map((m) => m.estado).filter(Boolean))].sort(
    (a, b) => String(a).localeCompare(String(b), 'es')
  );
}

function tiposDisponibles() {
  return (store.estado.tipos || [])
    .slice()
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

function municipiosDelInforme() {
  const estados = new Set(
    [...($('informeEstados')?.selectedOptions || [])].map((opcion) => opcion.value)
  );
  return (store.estado.municipios || [])
    .filter((municipio) => !estados.size || estados.has(municipio.estado))
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

function llenarSelect(select, filas, valor, etiqueta) {
  if (!select) return;
  select.innerHTML = filas
    .map((fila) => `<option value="${escaparHtml(valor(fila))}">${escaparHtml(etiqueta(fila))}</option>`)
    .join('');
}

function llenarMunicipiosInforme() {
  const select = $('informeMunicipios');
  if (!select) return;
  const anteriores = new Set([...select.selectedOptions].map((opcion) => opcion.value));
  llenarSelect(
    select,
    municipiosDelInforme(),
    (municipio) => municipio.id,
    (municipio) => `${municipio.nombre} — ${municipio.estado || ''}`
  );
  [...select.options].forEach((opcion) => {
    opcion.selected = anteriores.has(opcion.value);
  });
}

function aplicarAlcanceInforme() {
  const alcance = $('informeAlcance')?.value || 'todos';
  $('informeEstadosBox')?.classList.toggle('u-oculto', alcance !== 'estados');
  $('informeMunicipiosBox')?.classList.toggle('u-oculto', alcance !== 'municipios');
  if (alcance === 'municipios') llenarMunicipiosInforme();
}

function aplicarTiposInforme() {
  const modo = $('informeTiposModo')?.value || 'todos';
  $('informeTipoUnicoBox')?.classList.toggle('u-oculto', modo !== 'uno');
  $('informeTiposBox')?.classList.toggle('u-oculto', modo !== 'varios');
}

/** Prepara los desplegables del constructor con los catálogos ya cargados. */
function llenarConstructor() {
  const estados = estadosDisponibles();
  llenarSelect(
    $('informeEstados'),
    estados,
    (estado) => estado,
    (estado) => estado
  );
  const tipos = tiposDisponibles();
  for (const id of ['informeTipoUnico', 'informeTipos']) {
    const select = $(id);
    if (!select) continue;
    select.innerHTML = tipos
      .map((tipo) => `<option value="${escaparHtml(tipo.id)}">${escaparHtml(`${tipo.icono || ''} ${tipo.nombre}`.trim())}</option>`)
      .join('');
  }
  llenarMunicipiosInforme();
  aplicarAlcanceInforme();
  aplicarTiposInforme();
}

function leerFiltrosInforme() {
  const alcance = $('informeAlcance')?.value || 'todos';
  const estados =
    alcance === 'estados'
      ? [...($('informeEstados')?.selectedOptions || [])].map((opcion) => opcion.value)
      : [];
  const municipios =
    alcance === 'municipios'
      ? [...($('informeMunicipios')?.selectedOptions || [])].map((opcion) => opcion.value)
      : [];
  const modoTipos = $('informeTiposModo')?.value || 'todos';
  const tipos =
    modoTipos === 'uno'
      ? [$('informeTipoUnico')?.value].filter(Boolean)
      : modoTipos === 'varios'
        ? [...($('informeTipos')?.selectedOptions || [])].map((opcion) => opcion.value)
        : [];
  const comparar = $('informeComparar')?.value || 'ninguna';
  return {
    municipios,
    estados,
    tipos,
    tiposTodos: modoTipos === 'todos',
    compararPor: comparar,
    incluirDetalle: $('informeIncluirDetalle')?.checked !== false,
    desde: $('informeDesde')?.value || '',
    hasta: $('informeHasta')?.value || ''
  };
}

function opcionesGraficos() {
  const comparar = $('informeComparar')?.value || 'ninguna';
  return {
    barras: $('informeGraficoBarras')?.checked !== false,
    pastel: $('informeGraficoPastel')?.checked !== false,
    serie: $('informeGraficoSerie')?.checked !== false,
    comparacion:
      comparar !== 'ninguna' && $('informeGraficoComparacion')?.checked !== false,
    detalle: $('informeIncluirDetalle')?.checked !== false
  };
}

async function cargarVistaPrevia() {
  const filtros = leerFiltrosInforme();
  loading(true, 'Preparando el informe…');
  try {
    const datos = await statsService.datosInforme(filtros);
    reportesView.renderVistaPrevia(datos, opcionesGraficos());
    const resumen = $('informeResumenFiltros');
    if (resumen) {
      resumen.textContent = `${datos.resumen?.total ?? 0} incidencia(s) · ${
        datos.comparativa?.length || 0
      } grupo(s) para comparar.`;
    }
    return datos;
  } finally {
    loading(false);
  }
}

/** Descarta las estadísticas en caché (se llama tras limpiar o importar datos). */
function invalidarCacheInformes() {
  informesCache = { datos: null, momento: 0 };
}

export function registrar() {
  registrarAcciones({
    'reportes:abrir': () =>
      intentar(async () => {
        if (!sesion.esEmpleado()) {
          toast('Los informes solo están disponibles para funcionarios y administradores', 'err');
          return;
        }
        // El modal se abre al instante: las estadísticas se rellenan después.
        abrirModal('modalReportes');
        llenarConstructor();
        if ($('reporteDisenoPanel')) $('reporteDisenoPanel').hidden = !sesion.esAdmin();
        if (sesion.esAdmin()) {
          await cargarDiseno();
          prepararArrastreLogo();
        }
        const ahora = Date.now();
        if (!informesCache.datos || ahora - informesCache.momento > 60_000) {
          const datos = await statsService.informes();
          informesCache = { datos, momento: ahora };
        }
        if (informesCache.datos) {
          reportesView.renderStats(informesCache.datos);
          reportesView.renderTabla(informesCache.datos);
        }
      }),

    'reportes:logo': ({ elemento }) =>
      intentar(async () => {
        const archivo = elemento?.files?.[0];
        if (!archivo || !sesion.esAdmin()) return;
        loading(true, 'Subiendo logo…');
        try {
          const { logo } = await statsService.subirLogo(archivo);
          pintarLogo(logo.url);
          posicionarLogoDemo();
          // Se guarda al momento: así el logo ya sale en el informe sin que el
          // usuario tenga que recordar pulsar «Guardar diseño».
          await guardarDiseno();
          toast('Logo aplicado al informe', 'ok');
          await cargarVistaPrevia().catch(() => null);
        } finally {
          loading(false);
        }
      }),

    'reportes:quitarLogo': () =>
      intentar(async () => {
        if (!sesion.esAdmin()) return;
        pintarLogo('');
        await guardarDiseno();
        toast('Logo retirado del informe', 'info');
        await cargarVistaPrevia().catch(() => null);
      }),

    'reportes:guardarDiseno': () =>
      intentar(async () => {
        if (!sesion.esAdmin()) {
          toast('Solo un administrador puede cambiar el diseño del informe', 'err');
          return;
        }
        const completo = await guardarDiseno();
        toast(
          completo
            ? 'Diseño del informe guardado'
            : 'Diseño guardado, pero el servidor aún no acepta las opciones nuevas (color y evidencia). Actualiza el servidor para activarlas.',
          completo ? 'ok' : 'info'
        );
        // La vista previa refleja el logo y los márgenes sin cerrar el modal.
        await cargarVistaPrevia().catch(() => null);
      }),

    /** Vuelve el formulario a los valores recomendados; no guarda hasta pulsar «Guardar diseño». */
    'reportes:restablecerDiseno': () => {
      for (const campo of CAMPOS_DISENO) {
        const elemento = $(campo.id);
        if (elemento) elemento.value = campo.defecto;
      }
      posicionarLogoDemo();
      toast('Valores recomendados aplicados. Pulsa «Guardar diseño» para conservarlos.', 'info');
    },

    'reportes:cerrar': () => cerrarModal('modalReportes'),

    'reportes:alcance': () => aplicarAlcanceInforme(),
    'reportes:tiposModo': () => aplicarTiposInforme(),

    'reportes:previsualizar': () => intentar(() => cargarVistaPrevia()),

    'reportes:pdf': () =>
      intentar(async () => {
        const motor = await elegirVersionPdf();
        if (!motor) return;
        const blob = await statsService.pdfInforme(
          leerFiltrosInforme(),
          opcionesGraficos(),
          motor
        );
        descargar(blob, `informe-incidencias-${fechaLocal()}.pdf`, 'application/pdf');
        toast('PDF descargado', 'ok');
      }),

    'reportes:csv': () =>
      intentar(async () => {
        const texto = await statsService.csvInforme(leerFiltrosInforme());
        descargar(
          texto,
          `informe-incidencias-${fechaLocal()}.csv`,
          'text/csv;charset=utf-8'
        );
        toast('CSV descargado', 'ok');
      }),

    'reportes:json': () =>
      intentar(async () => {
        const datos = await datosDeExportacion();
        reportesView.descargarJSON(datos);
        toast('Respaldo JSON descargado', 'ok');
      }),

    'reportes:imprimible': () =>
      intentar(async () => {
        const datos = await cargarVistaPrevia();
        if (!reportesView.abrirInformeImprimible({ datos, opciones: opcionesGraficos() })) {
          toast('El navegador bloqueó la ventana de impresión', 'err');
        }
      }),

    'reportes:imprimir': () => window.print(),

    'reportes:limpiar': () =>
      intentar(async () => {
        if (!(await preguntar('⚠️ ¿Eliminar TODAS las incidencias? Esta acción no se puede deshacer.'))) return;
        if (!(await preguntar('¿Estás completamente seguro? Se borrarán todos los reportes y notificaciones.'))) return;

        loading(true, 'Borrando datos…');
        try {
          const resultado = await statsService.limpiar();
          if (sesion.esEmpleado()) await aplicacion.cargarEstadisticas();
          await aplicacion.recargarIncidencias();
          await aplicacion.recargarNotificaciones();
          // Una sola consulta; además se deja en caché para que al reabrir el modal no salgan cifras viejas.
          const informes = await statsService.informes();
          informesCache = { datos: informes, momento: Date.now() };
          reportesView.renderStats(informes);
          reportesView.renderTabla(informes);
          toast(`Datos eliminados (${resultado.incidencias} incidencias)`, 'ok');
        } finally {
          loading(false);
        }
      }),

    'reportes:abrirImportar': () => {
      reportesView.limpiarModalImportar();
      abrirModal('modalImportar');
    },

    'reportes:importar': () =>
      intentar(async () => {
        if (!sesion.esAdmin()) {
          toast('Solo un administrador puede importar respaldos', 'err');
          return;
        }
        if (!(await preguntar('La importación añadirá las incidencias del respaldo. ¿Continuar?'))) return;

        loading(true, 'Importando respaldo…');
        try {
          const respaldo = await reportesView.leerRespaldo();
          const resultado = await statsService.importar(respaldo);
          cerrarModal('modalImportar');
          invalidarCacheInformes();
          await aplicacion.recargarIncidencias();
          if (sesion.esEmpleado()) await aplicacion.cargarEstadisticas();
          toast(
            `Importadas ${resultado.incidencias} incidencias y ${resultado.archivos} archivos`,
            'ok'
          );
        } catch (error) {
          toast(mensajeDeError(error), 'err');
        } finally {
          loading(false);
        }
      })
  });
}
