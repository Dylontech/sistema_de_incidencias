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
        await navegarAlOrigen(aviso);
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
async function navegarAlOrigen(aviso) {
  if (!aviso) return;
  const destino = new URL(aviso.url || '/', location.origin);
  const incidenciaId =
    destino.searchParams.get('incidencia') ||
    (aviso.entidadTipo === 'incidencia' ? aviso.entidadId : null);
  if (incidenciaId) {
    incidenciasController.abrirDesdePanel(incidenciaId);
    return;
  }

  // Las solicitudes de informe abren directamente su resumen completo, no
  // solo la pestaña general. El administrador puede revisar el detalle antes
  // de generar o enviar el archivo.
  const solicitudId =
    destino.searchParams.get('solicitud') ||
    (aviso.entidadTipo === 'solicitud_informe' ? aviso.entidadId : null);
  if (solicitudId) {
    const { abrirPanel } = await import('./admin.controller.js');
    const abierto = await abrirPanel('solicitudes-informe').catch(() => false);
    if (!abierto) return;
    const { abrirDetalle } = await import('./solicitudesInforme.controller.js');
    await abrirDetalle(solicitudId);
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

  // Solicitudes de baja y de contraseña: la administración llega hasta la
  // cuenta y la fila concreta (con sus botones); quien las pidió ve el
  // resultado en «Mi cuenta».
  const panelUsuarios = destino.searchParams.get('panel') === 'usuarios';
  const usuarioAviso = destino.searchParams.get('usuario');
  const bajaAviso = destino.searchParams.get('baja') ||
    (aviso.entidadTipo === 'baja' ? aviso.entidadId : null);
  const passwordAviso = destino.searchParams.get('password') ||
    (aviso.entidadTipo === 'password' ? aviso.entidadId : null);
  const altaAviso = destino.searchParams.get('alta') ||
    (aviso.entidadTipo === 'alta' ? aviso.entidadId : null);
  if (panelUsuarios || bajaAviso || passwordAviso || altaAviso) {
    if (sesion.esEmpleado() && sesion.esAlgunaAdmin()) {
      const { abrirPanel, enfocarSolicitud } = await import('./admin.controller.js');
      const abierto = await abrirPanel('usuarios').catch(() => false);
      if (abierto) {
        await enfocarSolicitud({
          usuarioId: usuarioAviso,
          bajaId: bajaAviso,
          passwordId: passwordAviso,
          altaId: altaAviso
        });
        return;
      }
    }
    // Funcionario solicitante (o cualquier otra cuenta): el estado vive en
    // «Mi cuenta», junto a sus solicitudes de permisos y contraseña.
    document.querySelector('[data-action="perfil:abrir"]')?.click();
    return;
  }

  const tabAdmin = destino.searchParams.get('admin');
  if (tabAdmin) {
    const { abrirPanel } = await import('./admin.controller.js');
    await abrirPanel(tabAdmin).catch(() => false);
    return;
  }

  if (aviso.entidadTipo === 'recoleccion_firmas') {
    const { abrirPanel } = await import('./admin.controller.js');
    await abrirPanel('firmas').catch(() => false);
  }
}
