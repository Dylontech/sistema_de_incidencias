/**
 * Orquestación de la aplicación.
 *
 * Equivale al objeto `App` del monolito: carga los datos del backend, los deja
 * en el store, pinta las vistas y mantiene el refresco periódico de 60 s.
 */
import { store } from './store.js';
import { sesion } from './session.js';
import { cerrarTodosLosModales, modalAbierto } from './ui.js';
import { catalogosService } from '../services/catalogos.service.js';
import { tiposService } from '../services/tipos.service.js';
import { incidenciasService } from '../services/incidencias.service.js';
import { notificacionesService } from '../services/notificaciones.service.js';
import { statsService } from '../services/stats.service.js';
import * as loginView from '../views/login.view.js';
import * as listaView from '../views/lista.view.js';
import * as formView from '../views/incidenciaForm.view.js';
import * as tiposView from '../views/tipos.view.js';
import * as adminView from '../views/admin.view.js';
import * as notifView from '../views/notificaciones.view.js';
import * as mapa from '../map/mapa.js';

const INTERVALO_REFRESCO_MS = 60000;
let temporizador = null;

/* ------------------------------ sesión ------------------------------ */

/** Prepara toda la interfaz tras un login correcto. */
export async function arrancar({ usuario, municipioActivo }) {
  store.actualizar({ usuario, municipioActivo, municipio: municipioActivo }, 'sesion');
  loginView.mostrarApp({ usuario, municipioActivo });

  const [catalogos, tipos, municipios] = await Promise.all([
    catalogosService.catalogos(),
    tiposService.listar(),
    catalogosService.municipios()
  ]);

  store.actualizar(
    {
      catalogos: catalogos,
      tipos: tipos.tipos,
      municipios: municipios.municipios
    },
    'catalogos'
  );
  tiposView.renderIconPickers(catalogos.iconos);
  formView.renderSelectTipos(tipos.tipos);
  adminView.renderTipos(tipos.tipos, { puedeEliminar: sesion.esEmpleado() });
  adminView.renderMunicipios(municipios.municipios, municipioActivo?.id);

  montarMapa(municipioActivo);
  await Promise.all([cargarZonas(municipioActivo?.id), recargarIncidencias()]);
  await recargarNotificaciones();

  if (sesion.esEmpleado()) {
    await cargarEstadisticas();
  }

  iniciarTemporizador();
}

export function detener() {
  detenerTemporizador();
  cerrarTodosLosModales();
  store.limpiarDatos();
}

/* ------------------------------- mapa ------------------------------- */

export function montarMapa(municipio) {
  if (!municipio) return;
  mapa.inicializar(municipio);
  mapa.centrarMunicipio(municipio);
}

export async function cargarZonas(municipioId) {
  if (!municipioId) return;
  const { zonas } = await catalogosService.zonas(municipioId);
  store.actualizar({ zonas }, 'zonas');
  mapa.dibujarZonas(zonas);
  listaView.renderizarFiltros({
    tipos: store.estado.tipos,
    zonas,
    filtros: store.estado.filtros
  });
  adminView.renderZonas(
    zonas.map((z) => ({ ...z, reportes: 0, pendientes: 0, resueltas: 0 }))
  );
}

/* ------------------------------ datos ------------------------------- */

export async function recargarIncidencias() {
  const { incidencias } = await incidenciasService.listar(store.estado.filtros);
  store.actualizar({ incidencias }, 'incidencias');
  listaView.renderizar(incidencias, {
    tipos: store.estado.tipos,
    esCiudadano: sesion.esAnonimo()
  });
  mapa.refrescarMarcadores(incidencias, store.estado.tipos);
  return incidencias;
}

export async function recargarNotificaciones() {
  const { notificaciones } = await notificacionesService.listar();
  store.actualizar({ notificaciones }, 'notificaciones');
  notifView.renderizarBadge(notificaciones);
  if (notifView.panelVisible()) notifView.renderizarPanel(notificaciones);
  return notificaciones;
}

export async function cargarTipos() {
  const { tipos } = await tiposService.listar();
  store.actualizar({ tipos }, 'tipos');
  tiposView.renderIconPickers(store.estado.catalogos.iconos);
  formView.renderSelectTipos(tipos);
  listaView.renderizarFiltros({
    tipos,
    zonas: store.estado.zonas,
    filtros: store.estado.filtros
  });
  adminView.renderTipos(tipos, { puedeEliminar: sesion.esEmpleado() });
  return tipos;
}

export async function cargarEstadisticas() {
  const [panel, informes] = await Promise.all([statsService.panel(), statsService.informes()]);
  store.actualizar({ estadisticas: { panel, informes } }, 'estadisticas');
  adminView.renderStats(panel);
  adminView.renderTablaIncidencias(store.estado.incidencias, {
    tipos: store.estado.tipos,
    esAdmin: sesion.esAdmin(),
    busqueda: store.estado.busquedaAdmin
  });
  return { panel, informes };
}

export async function cargarResumenZonas(municipioId) {
  const { zonas } = await catalogosService.resumenZonas(municipioId);
  adminView.renderZonas(zonas);
  return zonas;
}

export async function cargarUsuarios() {
  const { usuarios } = await catalogosService.usuarios();
  adminView.renderUsuarios(usuarios, store.estado.municipios || []);
  return usuarios;
}

/* --------------------------- temporizador --------------------------- */

/** Refresco periódico silencioso (paridad con el setInterval de 60 s). */
function iniciarTemporizador() {
  detenerTemporizador();
  temporizador = setInterval(async () => {
    // No molestar mientras el usuario trabaja en un modal o la pestaña está oculta.
    if (document.hidden || modalAbierto('modalDetalle') || modalAbierto('modalIncidencia')) return;
    if (document.querySelector('.modal-overlay.show')) return;
    try {
      await recargarIncidencias();
      await recargarNotificaciones();
    } catch {
      /* el refresco silencioso no debe interrumpir al usuario */
    }
  }, INTERVALO_REFRESCO_MS);
}

function detenerTemporizador() {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

/** Aplica un nuevo municipio activo (tras `Admin.cambiarMunicipio`). */
export async function aplicarMunicipio(municipio) {
  store.actualizar({ municipioActivo: municipio, municipio }, 'municipio');
  loginView.actualizarMunicipioTitulo(municipio);
  mapa.reiniciarMunicipio(municipio);
  await Promise.all([cargarZonas(municipio.id), recargarIncidencias()]);
  if (sesion.esEmpleado()) await cargarEstadisticas();
}
