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

/**
 * Municipio con el que arranca la interfaz cuando la sesión guardada apunta a
 * uno que ya no existe en el catálogo. Espeja `MUNICIPIO_DEFAULT` del backend
 * (Maravatío, clave geoestadística 16050).
 */
const MUNICIPIO_POR_DEFECTO = '16050';

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

  // El listado llega sin polígonos: el del municipio activo se pide aparte para
  // poder dibujar el límite y la máscara del mapa. Si la sesión guardada apunta
  // a un municipio que ya no existe, se usa el que propuso el servidor.
  const activo =
    (await municipioCompleto(municipioActivo)) ||
    (await municipioCompleto(municipios.municipios.find((m) => m.id === MUNICIPIO_POR_DEFECTO))) ||
    null;
  loginView.renderMunicipios(municipios.municipios, activo?.id);

  montarMapa(activo);
  await Promise.all([cargarZonas(activo?.id), recargarIncidencias()]);
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

/**
 * Muestra u oculta el panel lateral.
 * Después hay que avisar a Leaflet: el mapa mide su contenedor solo al crearse
 * y, si el panel cambia de tamaño, queda una franja en blanco hasta que se
 * recalcula (lo que hacía `Sidebar.toggle` en la versión nueva del monolito).
 */
export function alternarSidebar() {
  loginView.alternarSidebar();
  mapa.invalidarTamano();
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
  const filtros = { ...store.estado.filtros, municipio: store.estado.municipioActivo?.id };
  const { incidencias } = await incidenciasService.listar(filtros);
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
  const municipioId = store.estado.municipioActivo?.id;
  const [panel, informes] = await Promise.all([
    statsService.panel(municipioId),
    statsService.informes(municipioId)
  ]);
  store.actualizar({ estadisticas: { panel, informes } }, 'estadisticas');
  adminView.renderStats(panel);
  // El bloque destacado y la tabla se pintan juntos: la marca de peligro
  // afecta a los dos.
  adminView.renderPeligrosas(store.estado.incidencias, { tipos: store.estado.tipos });
  adminView.renderTablaIncidencias(store.estado.incidencias, {
    tipos: store.estado.tipos,
    esAdmin: sesion.esAdmin(),
    busqueda: store.estado.busquedaAdmin,
    soloPeligrosas: store.estado.soloPeligrosas
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

/**
 * Municipio con su contorno. El listado llega sin polígonos (113 municipios
 * con sus límites suman más de un megabyte), así que se pide el detalle.
 * Si el municipio guardado en la sesión ya no existe (catálogo anterior) se
 * devuelve null para que quien llame use el municipio por defecto.
 */
async function municipioCompleto(municipio) {
  if (!municipio) return null;
  const enCatalogo = (id) => (store.estado.municipios || []).some((m) => m.id === id);
  if (municipio.poligono && !store.estado.municipios?.length) return municipio;
  if (municipio.poligono && enCatalogo(municipio.id)) return municipio;
  try {
    const { municipio: detalle } = await catalogosService.municipio(municipio.id);
    return detalle || null;
  } catch {
    return null;
  }
}

/**
 * Cambia el municipio activo desde el selector público.
 * Cualquiera puede hacerlo (el ciudadano anónimo y el admin); un funcionario
 * está atado al suyo, así que el servidor ignorará el cambio.
 */
export async function cambiarMunicipio(municipioId) {
  const actual = store.estado.municipioActivo;
  if (!municipioId || municipioId === actual?.id) return actual;

  const { municipio: detalle } = await catalogosService.municipio(municipioId);
  if (!detalle) return actual;

  await aplicarMunicipio(detalle);
  return detalle;
}

/** Aplica un nuevo municipio activo (selector público o panel de admin). */
export async function aplicarMunicipio(municipio) {
  const completo = await municipioCompleto(municipio);
  if (!completo) return;

  store.actualizar({ municipioActivo: completo, municipio: completo }, 'municipio');
  // El filtro de comunidades es del municipio anterior: se reinicia.
  store.actualizar({ filtros: { ...store.estado.filtros, zona: 'todos' } }, 'filtros');

  loginView.actualizarMunicipioTitulo(completo);
  loginView.renderMunicipios(store.estado.municipios || [], completo.id);
  sesion.actualizarMunicipio(completo);
  adminView.renderMunicipios(store.estado.municipios || [], completo.id);

  mapa.reiniciarMunicipio(completo);
  await Promise.all([cargarZonas(completo.id), recargarIncidencias()]);
  if (sesion.esEmpleado()) await cargarEstadisticas();
}
