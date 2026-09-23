/** Controlador de informes, exportaciones e importación del respaldo anterior. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, loading, preguntar, toast } from '../core/ui.js';
import { intentar, mensajeDeError } from '../core/errores.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { statsService } from '../services/stats.service.js';
import * as aplicacion from '../core/aplicacion.js';
import * as reportesView from '../views/reportes.view.js';

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
          municipio: store.estado.municipioActivo
        });
      }),

    'reportes:imprimir': () => window.print(),

    'reportes:limpiar': () =>
      intentar(async () => {
        if (!preguntar('⚠️ ¿Eliminar TODAS las incidencias? Esta acción no se puede deshacer.')) return;
        if (!preguntar('¿Estás completamente seguro? Se borrarán todos los reportes y notificaciones.')) return;

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
        if (!preguntar('La importación añadirá las incidencias del respaldo. ¿Continuar?')) return;

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
