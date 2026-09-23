/** Controlador del panel de administración. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, loading, preguntar, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { debounce } from '../core/utils.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { incidenciasService } from '../services/incidencias.service.js';
import { authService } from '../services/auth.service.js';
import * as aplicacion from '../core/aplicacion.js';
import * as adminView from '../views/admin.view.js';
import * as detalleController from './incidencias.controller.js';

/** Carga los datos de la pestaña solicitada. */
async function abrirTab(nombre) {
  adminView.activarTab(nombre);
  switch (nombre) {
    case 'stats':
      await aplicacion.cargarEstadisticas();
      break;
    case 'incidencias':
      await aplicacion.recargarIncidencias();
      adminView.renderTablaIncidencias(store.estado.incidencias, {
        tipos: store.estado.tipos,
        esAdmin: sesion.esAdmin(),
        busqueda: adminView.valorBusqueda()
      });
      break;
    case 'tipos':
      await aplicacion.cargarTipos();
      break;
    case 'municipios':
      adminView.renderMunicipios(store.estado.municipios || [], store.estado.municipioActivo?.id);
      break;
    case 'zonas': {
      const municipioId = store.estado.municipioActivo?.id;
      if (municipioId) await aplicacion.cargarResumenZonas(municipioId);
      break;
    }
    case 'usuarios':
      await aplicacion.cargarUsuarios();
      break;
    default:
      break;
  }
}

export function registrar() {
  const buscarConRetraso = debounce(() => {
    adminView.renderTablaIncidencias(store.estado.incidencias, {
      tipos: store.estado.tipos,
      esAdmin: sesion.esAdmin(),
      busqueda: adminView.valorBusqueda()
    });
  }, 200);

  registrarAcciones({
    'admin:abrir': () =>
      intentar(async () => {
        if (!sesion.esEmpleado()) {
          toast('No tienes permiso para acceder al panel', 'err');
          return;
        }
        loading(true, 'Cargando panel…');
        try {
          await abrirTab('stats');
          await abrirTab('incidencias');
          await aplicacion.cargarTipos();
          await aplicacion.cargarUsuarios();
          adminView.activarTab('stats');
          abrirModal('modalAdmin');
        } finally {
          loading(false);
        }
      }),

    'admin:cerrar': () => cerrarModal('modalAdmin'),

    'admin:tab': ({ valor }) => intentar(() => abrirTab(valor)),

    'admin:buscar': () => buscarConRetraso(),

    'admin:verDetalle': ({ id }) => {
      cerrarModal('modalAdmin');
      detalleController.abrirDesdePanel(id);
    },

    'admin:eliminar': ({ id }) =>
      intentar(async () => {
        if (!preguntar('¿Eliminar esta incidencia? Esta acción no se puede deshacer.')) return;
        await incidenciasService.eliminar(id);
        await aplicacion.recargarIncidencias();
        if (sesion.esEmpleado()) await aplicacion.cargarEstadisticas();
        adminView.renderTablaIncidencias(store.estado.incidencias, {
          tipos: store.estado.tipos,
          esAdmin: sesion.esAdmin(),
          busqueda: adminView.valorBusqueda()
        });
        toast('Incidencia eliminada', 'ok');
      }),

    /** Cambio de municipio activo: exige la clave, como en el monolito. */
    'admin:cambiarMunicipio': () =>
      intentar(async () => {
        const municipioId = adminView.valorMunicipioSeleccionado();
        if (!municipioId) return;
        const clave = window.prompt('Ingresa la clave de acceso del municipio:');
        if (!clave) return;

        loading(true, 'Cambiando de municipio…');
        try {
          const respuesta = await authService.cambiarMunicipio({ municipioId, clave });
          sesion.guardar(respuesta);
          await aplicacion.aplicarMunicipio(respuesta.municipioActivo);
          adminView.renderMunicipios(store.estado.municipios || [], respuesta.municipioActivo?.id);
          toast(`Municipio cambiado a ${respuesta.municipioActivo?.nombre}`, 'ok');
        } finally {
          loading(false);
        }
      })
  });
}
