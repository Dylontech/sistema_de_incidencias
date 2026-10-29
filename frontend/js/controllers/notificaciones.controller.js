/** Controlador de notificaciones. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { notificacionesService } from '../services/notificaciones.service.js';
import * as aplicacion from '../core/aplicacion.js';
import * as notifView from '../views/notificaciones.view.js';
import * as formView from '../views/incidenciaForm.view.js';
import * as incidenciasController from './incidencias.controller.js';

let historialPagina = 1;

async function cargarHistorial(pagina = 1) {
  historialPagina = Math.max(Number(pagina) || 1, 1);
  const filtros = notifView.leerFiltrosHistorial();
  const datos = await notificacionesService.historial({
    ...filtros,
    pagina: historialPagina,
    limite: 20
  });
  notifView.renderHistorial(datos);
}

export function registrar() {
  registrarAcciones({
    'notificaciones:leer': ({ id }) =>
      intentar(async () => {
        await notificacionesService.marcarLeida(id);
        await aplicacion.recargarNotificaciones();
      }),

    /**
     * Clic en un aviso: se marca leído, se cierra el panel y se abre el origen
     * (ticket, bandeja de mensajes/contacto/sugerencias o panel de admin).
     */
    'notificaciones:abrir': ({ id }) =>
      intentar(async () => {
        const aviso = (store.estado.notificaciones || []).find((n) => n.id === id);
        await notificacionesService.marcarLeida(id);
        await aplicacion.recargarNotificaciones();
        notifView.alternarPanel(false);
        navegarAlOrigen(aviso);
      }),

    'notificaciones:marcarTodas': () =>
      intentar(
        async () => {
          await notificacionesService.marcarTodas();
          await aplicacion.recargarNotificaciones();
        },
        { exito: 'Todas marcadas como leídas' }
      ),

    'notificaciones:eliminar': ({ id }) =>
      intentar(async () => {
        await notificacionesService.eliminar(id);
        await aplicacion.recargarNotificaciones();
      }),

    /** Abre el modal de configuración de avisos de incidencias nuevas. */
    'notificaciones:configurar': () =>
      intentar(async () => {
        const { preferencias } = await notificacionesService.preferencias();
        notifView.renderConfig({
          preferencias,
          municipios: formView.municipiosPermitidos(
            store.estado.usuario,
            store.estado.municipios || []
          )
        });
        abrirModal('modalNotifConfig', { nested: true });
      }),

    'notificaciones:modo': ({ valor }) =>
      notifView.alternarMunicipiosConfig(valor || notifView.modoSeleccionado()),

    'notificaciones:guardarConfig': () =>
      intentar(async () => {
        const datos = notifView.leerConfig();
        if (datos.modo === 'municipios' && !datos.municipios.length) {
          toast('Elige al menos un municipio', 'err');
          return;
        }
        await notificacionesService.guardarPreferencias(datos);
        cerrarModal('modalNotifConfig');
        toast('Preferencias de notificación guardadas', 'ok');
      }),

    /** Cierra el panel al hacer clic fuera de él. */
    'notificaciones:cerrarPanel': () => notifView.alternarPanel(false),

    /** Historial paginado con buscador y restauración. */
    'notificaciones:historial': () =>
      intentar(async () => {
        notifView.alternarPanel(false);
        abrirModal('modalHistorialNotif');
        await cargarHistorial(1);
      }),

    'notificaciones:historialBuscar': () => intentar(() => cargarHistorial(1)),

    'notificaciones:historialLimpiar': () =>
      intentar(async () => {
        const texto = document.getElementById('historialNotifTexto');
        const evento = document.getElementById('historialNotifEvento');
        const desde = document.getElementById('historialNotifDesde');
        const hasta = document.getElementById('historialNotifHasta');
        if (texto) texto.value = '';
        if (evento) evento.value = '';
        if (desde) desde.value = '';
        if (hasta) hasta.value = '';
        await cargarHistorial(1);
      }),

    'notificaciones:historialPagina': ({ valor }) => intentar(() => cargarHistorial(valor)),

    'notificaciones:restaurar': ({ id }) =>
      intentar(async () => {
        await notificacionesService.restaurar(id);
        await aplicacion.recargarNotificaciones();
        await cargarHistorial(historialPagina);
        toast('Aviso restaurado en la campana', 'ok');
      }),

    'notificaciones:archivarTodas': () =>
      intentar(async () => {
        await notificacionesService.archivarTodas();
        await aplicacion.recargarNotificaciones();
        await cargarHistorial(1);
        toast('Avisos archivados; sigue disponibles en el historial', 'ok');
      })
  });
}

/**
 * Lleva al origen del aviso usando las acciones ya existentes (bandeja, panel
 * de admin) o la página de soporte para tickets.
 */
function navegarAlOrigen(aviso) {
  if (!aviso) return;
  const destino = new URL(aviso.url || '/', location.origin);
  const incidenciaId =
    destino.searchParams.get('incidencia') ||
    (aviso.entidadTipo === 'incidencia' ? aviso.entidadId : null);
  if (incidenciaId) {
    incidenciasController.abrirDesdePanel(incidenciaId);
    return;
  }

  if (aviso.entidadTipo === 'ticket' && aviso.entidadId) {
    const atiende = sesion.usuario?.puedeAtenderTickets === true || sesion.rol === 'admin';
    location.assign(
      atiende
        ? `/soporte?ticket=${encodeURIComponent(aviso.entidadId)}`
        : `/?ticket=${encodeURIComponent(aviso.entidadId)}`
    );
    return;
  }

  const contacto = destino.searchParams.get('contacto');
  if (contacto) {
    document.querySelector('[data-action="contacto:abrir"]')?.click();
    return;
  }

  const bandeja = destino.searchParams.get('bandeja');
  if (bandeja) {
    document.querySelector('[data-action="bandeja:abrir"]')?.click();
    setTimeout(
      () => document.querySelector(`[data-action="bandeja:tab"][data-valor="${bandeja}"]`)?.click(),
      250
    );
    const hilo = destino.searchParams.get('hilo');
    if (hilo) {
      setTimeout(
        () => document.querySelector(`[data-action="bandeja:hilo"][data-valor="${hilo}"]`)?.click(),
        450
      );
    }
    return;
  }

  const tabAdmin = destino.searchParams.get('admin');
  if (tabAdmin) {
    document.getElementById('btn-admin')?.click();
    setTimeout(
      () => document.querySelector(`[data-action="admin:tab"][data-valor="${tabAdmin}"]`)?.click(),
      250
    );
    return;
  }

  if (aviso.entidadTipo === 'recoleccion_firmas') {
    document.getElementById('btn-admin')?.click();
    setTimeout(
      () => document.querySelector('[data-action="admin:tab"][data-valor="firmas"]')?.click(),
      250
    );
  }
}
