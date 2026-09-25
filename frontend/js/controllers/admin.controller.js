/** Controlador del panel de administración. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, loading, preguntar, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { debounce } from '../core/utils.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { incidenciasService } from '../services/incidencias.service.js';
import * as aplicacion from '../core/aplicacion.js';
import * as adminView from '../views/admin.view.js';
import * as detalleController from './incidencias.controller.js';

/** Carga los datos de la pestaña solicitada. */
/**
 * Vuelve a pintar el bloque de incidencias peligrosas y la tabla.
 * Se hace siempre junto porque una marca de peligro cambia los dos.
 */
function pintarPanelIncidencias() {
  adminView.renderPeligrosas(store.estado.incidencias, { tipos: store.estado.tipos });
  adminView.renderTablaIncidencias(store.estado.incidencias, {
    tipos: store.estado.tipos,
    esAdmin: sesion.esAdmin(),
    busqueda: adminView.valorBusqueda(),
    soloPeligrosas: store.estado.soloPeligrosas
  });

  const boton = document.getElementById('btn-solo-peligrosas');
  if (boton) boton.classList.toggle('btn-primary', store.estado.soloPeligrosas === true);
}

async function abrirTab(nombre) {
  adminView.activarTab(nombre);
  switch (nombre) {
    case 'stats':
      await aplicacion.cargarEstadisticas();
      break;
    case 'incidencias':
      await aplicacion.recargarIncidencias();
      pintarPanelIncidencias();
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
  const buscarConRetraso = debounce(() => pintarPanelIncidencias(), 200);

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

    /* -------------------- cuentas del personal -------------------- */

    /** Alta: abre el modal vacío (el panel de administración queda detrás). */
    'admin:usuarioNuevo': () => {
      if (!sesion.esAdmin()) {
        toast('Solo un administrador puede crear cuentas', 'err');
        return;
      }
      adminView.prepararModalUsuario({ municipios: store.estado.municipios || [] });
      abrirModal('modalUsuario', { nested: true });
    },

    /** Edición: rellena el modal con la cuenta elegida en la tabla. */
    'admin:usuarioEditar': ({ id }) => {
      const usuario = (store.estado.usuarios || []).find((u) => u.id === id);
      if (!usuario) {
        toast('No se encontró esa cuenta, recarga el panel', 'err');
        return;
      }
      adminView.prepararModalUsuario({
        usuario,
        municipios: store.estado.municipios || []
      });
      abrirModal('modalUsuario', { nested: true });
    },

    /** El rol decide si el municipio es obligatorio (funcionario) o no (admin). */
    'admin:usuarioRol': () => adminView.actualizarNotaMunicipioUsuario(),

    /** Crea o actualiza la cuenta y repinta la tabla. */
    'admin:usuarioGuardar': () =>
      intentar(async () => {
        if (!sesion.esAdmin()) {
          toast('Solo un administrador puede gestionar cuentas', 'err');
          return;
        }

        const datos = adminView.valoresUsuarioForm();
        if (!datos.id && !datos.username) return toast('Escribe el usuario de acceso', 'err');
        if (!datos.nombre) return toast('Escribe el nombre completo', 'err');
        if (datos.rol === 'funcionario' && !datos.municipioId) {
          return toast('Elige el municipio del funcionario', 'err');
        }
        if ((!datos.id || datos.password) && datos.password.length < 8) {
          return toast('La contraseña debe tener al menos 8 caracteres', 'err');
        }

        // En edición, la contraseña vacía significa «no la cambies».
        const envio = {
          nombre: datos.nombre,
          rol: datos.rol,
          municipioId: datos.municipioId,
          correo: datos.correo,
          activo: datos.activo
        };
        if (datos.password) envio.password = datos.password;
        if (!datos.id) {
          envio.username = datos.username;
          envio.password = datos.password;
        }

        loading(true, datos.id ? 'Guardando cuenta…' : 'Creando cuenta…');
        try {
          const usuario = await aplicacion.guardarUsuario(datos.id, envio);
          cerrarModal('modalUsuario');
          toast(
            datos.id ? `Cuenta de ${usuario.nombre} actualizada` : `Cuenta de ${usuario.nombre} creada`,
            'ok'
          );
        } finally {
          loading(false);
        }
      }),

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
    /** Marca o desmarca una incidencia como peligrosa (solo personal). */
    'admin:marcarPeligro': ({ id, valor }) =>
      intentar(async () => {
        if (!sesion.esEmpleado()) {
          toast('Solo el personal puede marcar incidencias peligrosas', 'err');
          return;
        }

        if (valor === 'quitar') {
          await detalleController.aplicarMarcaPeligro(id, { peligrosa: false });
          pintarPanelIncidencias();
          return;
        }

        // Marcar pide el motivo en un modal (el panel sigue abierto debajo).
        detalleController.abrirMotivoPeligro(id);
      }),

    /** Alterna el filtro «solo peligrosas» de la tabla. */
    'admin:soloPeligrosas': () => {
      store.actualizar({ soloPeligrosas: !store.estado.soloPeligrosas }, 'admin');
      pintarPanelIncidencias();
      toast(
        store.estado.soloPeligrosas ? 'Mostrando solo las peligrosas' : 'Mostrando todas',
        'ok'
      );
    },

    // El municipio activo se cambia desde el mismo flujo público (sin clave
    // de acceso): el alcance de un administrador no está restringido.
    'admin:cambiarMunicipio': () =>
      intentar(async () => {
        const municipioId = adminView.valorMunicipioSeleccionado();
        if (!municipioId) return;

        loading(true, 'Cambiando de municipio…');
        try {
          const municipio = await aplicacion.cambiarMunicipio(municipioId);
          toast(`Municipio cambiado a ${municipio?.nombre || municipioId}`, 'ok');
        } finally {
          loading(false);
        }
      })
  });
}
