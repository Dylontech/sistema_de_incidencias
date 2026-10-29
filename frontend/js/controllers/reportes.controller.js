/** Controlador de informes, exportaciones e importación del respaldo anterior. */
import { registrarAcciones } from '../core/eventos.js';
import { $ } from '../core/utils.js';
import { abrirModal, cerrarModal, loading, preguntar, toast } from '../core/ui.js';
import { intentar, mensajeDeError } from '../core/errores.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { statsService } from '../services/stats.service.js';
import { configuracionService } from '../services/configuracion.service.js';
import * as aplicacion from '../core/aplicacion.js';
import * as reportesView from '../views/reportes.view.js';

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

async function cargarDiseno() {
  const panel = $('reporteDisenoPanel');
  if (!panel || !sesion.esAdmin()) return;
  panel.hidden = false;
  try {
    const { configuracion } = await configuracionService.listar();
    const logo = valorConfig(configuracion, 'informes.logo_url');
    if ($('reporteLogoPosicion')) {
      $('reporteLogoPosicion').value = valorConfig(configuracion, 'informes.logo_posicion', 'izquierda');
    }
    if ($('reporteLogoAncho')) $('reporteLogoAncho').value = valorConfig(configuracion, 'informes.logo_ancho', 90);
    if ($('reporteLogoX')) $('reporteLogoX').value = valorConfig(configuracion, 'informes.logo_desplazamiento_x', 0);
    if ($('reporteLogoY')) $('reporteLogoY').value = valorConfig(configuracion, 'informes.logo_desplazamiento_y', 0);
    if ($('reporteMargenSuperior')) {
      $('reporteMargenSuperior').value = valorConfig(configuracion, 'informes.margen_superior', 18);
    }
    if ($('reporteMargenDerecho')) {
      $('reporteMargenDerecho').value = valorConfig(configuracion, 'informes.margen_derecho', 15);
    }
    if ($('reporteMargenInferior')) {
      $('reporteMargenInferior').value = valorConfig(configuracion, 'informes.margen_inferior', 18);
    }
    if ($('reporteMargenIzquierdo')) {
      $('reporteMargenIzquierdo').value = valorConfig(configuracion, 'informes.margen_izquierdo', 15);
    }
    if ($('reportePieTexto')) {
      $('reportePieTexto').value = valorConfig(
        configuracion,
        'informes.pie_texto',
        'Sistema de Incidencias Municipales'
      );
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

function leerDiseno() {
  return {
    'informes.logo_url': $('reporteLogoUrl')?.value || '',
    'informes.logo_posicion': $('reporteLogoPosicion')?.value || 'izquierda',
    'informes.logo_ancho': Number($('reporteLogoAncho')?.value) || 90,
    'informes.logo_desplazamiento_x': Number($('reporteLogoX')?.value) || 0,
    'informes.logo_desplazamiento_y': Number($('reporteLogoY')?.value) || 0,
    'informes.margen_superior': Number($('reporteMargenSuperior')?.value) || 18,
    'informes.margen_derecho': Number($('reporteMargenDerecho')?.value) || 15,
    'informes.margen_inferior': Number($('reporteMargenInferior')?.value) || 18,
    'informes.margen_izquierdo': Number($('reporteMargenIzquierdo')?.value) || 15,
    'informes.pie_texto': $('reportePieTexto')?.value.trim() || ''
  };
}

async function datosDeExportacion() {
  const datos = await statsService.exportacion();
  store.actualizar({ exportacion: datos }, 'exportacion');
  return datos;
}

export function registrar() {
  registrarAcciones({
    'reportes:abrir': () =>
      intentar(async () => {
        if (!sesion.esEmpleado()) {
          toast('Los informes solo están disponibles para funcionarios y administradores', 'err');
          return;
        }
        const informes = await statsService.informes();
        reportesView.renderStats(informes);
        reportesView.renderTabla(informes);
        abrirModal('modalReportes');
        if ($('reporteDisenoPanel')) $('reporteDisenoPanel').hidden = !sesion.esAdmin();
        if (sesion.esAdmin()) {
          await cargarDiseno();
          prepararArrastreLogo();
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
          toast('Logo cargado. Guarda el diseño para aplicarlo.', 'ok');
        } finally {
          loading(false);
        }
      }),

    'reportes:quitarLogo': () => {
      if (!sesion.esAdmin()) return;
      pintarLogo('');
      toast('Logo retirado del diseño. Guarda los cambios.', 'info');
    },

    'reportes:guardarDiseno': () =>
      intentar(async () => {
        if (!sesion.esAdmin()) {
          toast('Solo un administrador puede cambiar el diseño del informe', 'err');
          return;
        }
        await configuracionService.guardar(leerDiseno());
        toast('Diseño del informe guardado', 'ok');
      }),

    'reportes:cerrar': () => cerrarModal('modalReportes'),

    'reportes:csv': () =>
      intentar(async () => {
        const datos = await datosDeExportacion();
        if (reportesView.descargarCSV(datos)) toast('CSV descargado', 'ok');
        else toast('No hay incidencias para exportar', 'err');
      }),

    'reportes:json': () =>
      intentar(async () => {
        const datos = await datosDeExportacion();
        reportesView.descargarJSON(datos);
        toast('Respaldo JSON descargado', 'ok');
      }),

    'reportes:imprimible': () =>
      intentar(async () => {
        const datos = await datosDeExportacion();
        reportesView.abrirInformeImprimible({
          incidencias: datos.incidencias,
          tipos: datos.tipos,
          municipio: store.estado.municipioActivo,
          plantilla: datos.informePlantilla
        });
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
          reportesView.renderStats(await statsService.informes());
          reportesView.renderTabla(await statsService.informes());
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
