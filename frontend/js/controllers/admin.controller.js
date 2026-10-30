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
import { cargar as cargarCampanas } from './campanas.controller.js';
import { clavesService } from '../services/claves.service.js';
import { sesionesService } from '../services/sesiones.service.js';
import { auditoriaService } from '../services/auditoria.service.js';
import { solicitudesAccesoService } from '../services/solicitudes-acceso.service.js';
import { ticketsService } from '../services/tickets.service.js';
import { notificacionesService } from '../services/notificaciones.service.js';
import { catalogosService } from '../services/catalogos.service.js';
import { abrirSugerenciasDeMunicipio } from './comunicacion.controller.js';
import { cargar as cargarConfiguracion } from './configuracion.controller.js';
import { cargar as cargarLegal } from './legal.controller.js';
import { cargar as cargarFirmasAdmin } from './firmasAdmin.controller.js';
import { cargar as cargarSolicitudesInforme } from './solicitudesInforme.controller.js';
import { cargar as cargarRespaldos } from './respaldos.controller.js';
import { cargar as cargarSimulador } from './simulador.controller.js';
import { cargar as cargarPublicidad } from './publicidad.controller.js';
import { cargar as cargarCorreosInstitucionales } from './correosInstitucionales.controller.js';
import { crearSelectorTerritorial } from '../core/selector-territorial.js';
import { permisosService } from '../services/permisos.service.js';
import { passwordService } from '../services/password.service.js';
import { bajaService } from '../services/baja.service.js';
import { altaService } from '../services/alta.service.js';
import { rolesService } from '../services/roles.service.js';

let selectorStats = null;
let filtrosStats = null;
let fichaActual = null;
/** Candado de la generación de claves: evita altas duplicadas por doble clic. */
let creandoClave = false;

const CLAVE_TAMANO_PANEL = 'inc_admin_panel_tamano_v1';
const TAMANOS_PANEL = ['compacto', 'normal', 'grande', 'tv'];

function tamanoPanelGuardado() {
  const valor = localStorage.getItem(CLAVE_TAMANO_PANEL);
  return TAMANOS_PANEL.includes(valor) ? valor : 'normal';
}

function aplicarTamanoPanel(nivel) {
  const elegido = TAMANOS_PANEL.includes(nivel) ? nivel : 'normal';
  const caja = document.getElementById('modalAdminBox');
  if (caja) {
    TAMANOS_PANEL.forEach((tamano) => caja.classList.remove(`admin-panel-${tamano}`));
    caja.classList.add(`admin-panel-${elegido}`);
  }
  try {
    localStorage.setItem(CLAVE_TAMANO_PANEL, elegido);
  } catch {
    // Sin almacenamiento: el tamaño dura la sesión.
  }
  return elegido;
}

function cambiarTamanoPanel(paso) {
  const actual = TAMANOS_PANEL.indexOf(tamanoPanelGuardado());
  const siguiente = paso === 'restablecer'
    ? 'normal'
    : TAMANOS_PANEL[Math.max(0, Math.min(TAMANOS_PANEL.length - 1, actual + (paso === 'mas' ? 1 : -1)))];
  return aplicarTamanoPanel(siguiente);
}

/** Permiso mínimo para ver y cargar cada pestaña del panel. */
export const PERMISO_POR_TAB = {
  stats: 'ver_metricas',
  incidencias: 'ver_incidencias_panel',
  tipos: 'ver_tipos',
  municipios: 'ver_municipios_panel',
  claves: 'ver_claves',
  'avisos-clave': 'ver_avisos_clave',
  zonas: 'ver_zonas',
  usuarios: 'ver_usuarios',
  solicitudes: 'ver_solicitudes_acceso',
  tickets: 'atender_tickets',
  sesiones: 'ver_monitoreo',
  auditoria: 'ver_auditoria',
  notificaciones: 'configurar_notificaciones',
  moderacion: 'ver_moderacion',
  firmas: 'ver_firmas',
  'solicitudes-informe': 'gestionar_solicitudes_informe',
  legal: 'gestionar_legal',
  configuracion: 'gestionar_configuracion',
  respaldos: 'gestionar_respaldos',
  simulador: 'usar_simulador',
  publicidad: 'gestionar_publicidad',
  correos: 'gestionar_correos'
};

function permisoDeTab(nombre) {
  return PERMISO_POR_TAB[nombre] || null;
}

export function puedeAbrirTab(nombre) {
  if (nombre === 'notificaciones' && !sesion.esAdmin()) return false;
  const permiso = permisoDeTab(nombre);
  return !permiso || sesion.puede(permiso);
}

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

export async function abrirTab(nombre) {
  if (!puedeAbrirTab(nombre)) {
    toast('Tu cuenta no tiene permiso para esta sección', 'err');
    return false;
  }
  adminView.activarTab(nombre);
  switch (nombre) {
    case 'stats':
      prepararSelectorStats();
      await aplicacion.cargarEstadisticas(filtrosStats);
      break;
    case 'incidencias':
      await aplicacion.recargarIncidencias();
      pintarPanelIncidencias();
      break;
    case 'tipos':
      await aplicacion.cargarTipos();
      break;
    case 'municipios':
      await cargarResumenMunicipios();
      break;
    case 'claves':
      await cargarClaves();
      break;
    case 'avisos-clave':
      await cargarAvisosClave();
      break;
    case 'sesiones':
      await cargarSesiones();
      break;
    case 'auditoria':
      await cargarAuditoria();
      break;
    case 'notificaciones':
      await cargarConfigNotificaciones();
      break;
    case 'solicitudes':
      await cargarSolicitudesAcceso();
      break;
    case 'tickets': {
      await cargarTicketsAdmin();
      const panelReglas = document.getElementById('reglasTicketsPanel');
      panelReglas?.classList.toggle('u-oculto', !sesion.esAdmin());
      if (sesion.esAdmin()) await cargarReglasTickets();
      else adminView.limpiarReglaSimulada();
      break;
    }
    case 'zonas': {
      const municipioId = store.estado.municipioActivo?.id;
      if (municipioId) await aplicacion.cargarResumenZonas(municipioId);
      break;
    }
    case 'usuarios':
      await Promise.all([
        aplicacion.cargarUsuarios(document.getElementById('usuariosTipo')?.value || 'personal'),
        cargarRolesEspeciales(),
        cargarCatalogoRoles()
      ]);
      if (sesion.puede('ver_solicitudes_permisos')) await cargarSolicitudesPermisos();
      await cargarSolicitudesPassword();
      await cargarSolicitudesBaja();
      await cargarSolicitudesAlta();
      break;
    case 'moderacion':
      // La cola se apoya en el listado ya cargado (incluye las ocultas del
      // personal), así que se refresca antes.
      await aplicacion.recargarIncidencias();
      await aplicacion.cargarModeracion();
      break;
    case 'campanas':
      await cargarCampanas();
      break;
    case 'firmas':
      await cargarFirmasAdmin();
      break;
    case 'solicitudes-informe':
      await cargarSolicitudesInforme();
      break;
    case 'legal':
      await cargarLegal('terminos');
      break;
    case 'configuracion':
      await cargarConfiguracion();
      break;
    case 'respaldos':
      await cargarRespaldos();
      break;
    case 'simulador':
      await cargarSimulador();
      break;
    case 'publicidad':
      await Promise.all([cargarPublicidad(), cargarCampanas()]);
      break;
    case 'correos':
      await cargarCorreosInstitucionales();
      break;
    default:
      break;
  }
}

async function cargarClaves() {
  const { claves } = await clavesService.listar();
  adminView.renderClaves(claves, store.estado.municipios || [], {
    puedeEliminar: sesion.puede('eliminar_claves')
  });
}

/** Claves vigentes que se pueden asignar al alta de una cuenta. */
async function clavesParaAlta() {
  if (!sesion.puede('ver_claves') && !sesion.puede('ver_avisos_clave')) return [];
  try {
    const { claves } = await clavesService.listar();
    return claves || [];
  } catch {
    return [];
  }
}

async function cargarAvisosClave() {
  const { claves } = await clavesService.listar();
  adminView.renderAvisosClave(claves, store.estado.municipios || []);
}

/** Busca una clave ya cargada y, si no está, la recarga desde el servidor. */
async function claveParaAvisos(id) {
  let clave = adminView.clavesCargadas().find((c) => c.id === id);
  if (!clave) {
    const { claves } = await clavesService.listar();
    adminView.renderAvisosClave(claves, store.estado.municipios || []);
    clave = (claves || []).find((c) => c.id === id);
  }
  return clave || null;
}

let rolesEspeciales = [];
let rolesIntegrados = [];
let rolesPropios = [];

async function cargarRolesEspeciales() {
  const { roles } = await rolesService.listar();
  rolesEspeciales = roles || [];
  adminView.renderRolesEspeciales(rolesEspeciales);
  adminView.renderListaRoles(rolesEspeciales);
  return rolesEspeciales;
}

/** Roles del sistema (matriz editable) y roles propios. */
async function cargarCatalogoRoles() {
  const { roles } = await rolesService.listarRoles();
  rolesIntegrados = (roles || []).filter((r) => r.tipo === 'integrado');
  rolesPropios = (roles || []).filter((r) => r.tipo === 'propio');
  adminView.renderRolesSistema(rolesIntegrados);
  adminView.renderRolesPropios(rolesPropios);
  return { integrados: rolesIntegrados, propios: rolesPropios };
}

/** Estados que esta sesión puede elegir (alcance real, no el catálogo nacional). */
function estadosDelAlcance() {
  const propios = store.estado.alcance?.estados;
  return Array.isArray(propios) && propios.length ? propios : store.estado.estados || [];
}

/** Nombres de los municipios del propio funcionario (territorio fijo al crear). */
function municipiosDelActor() {
  const ids =
    store.estado.alcance?.municipios ||
    (store.estado.municipioActivo?.id ? [store.estado.municipioActivo.id] : []);
  return ids.map(
    (id) => store.estado.municipios?.find((m) => String(m.id) === String(id))?.nombre || id
  );
}

async function cargarSolicitudesPermisos() {
  const contenedor = document.getElementById('solicitudesPermisosLista');
  if (!contenedor) return;
  const caja = document.getElementById('solicitudesPermisosBox');
  caja?.classList.toggle('u-oculto', !sesion.puede('ver_solicitudes_permisos'));
  if (!sesion.puede('ver_solicitudes_permisos')) return;
  try {
    const { solicitudes } = await permisosService.solicitudes();
    adminView.renderSolicitudesPermisos(solicitudes || []);
  } catch {
    contenedor.innerHTML = '<p class="campo-nota">No se pudieron cargar las solicitudes.</p>';
  }
}

/** Solicitudes de cambio de contraseña (solo con permiso de revelado). */
async function cargarSolicitudesPassword() {
  const caja = document.getElementById('solicitudesPasswordBox');
  const contenedor = document.getElementById('solicitudesPasswordLista');
  if (!caja || !contenedor) return;
  const permitido = sesion.puede('revelar_password_usuarios');
  caja.classList.toggle('u-oculto', !permitido);
  if (!permitido) return;
  try {
    const { solicitudes } = await passwordService.listar({ estado: 'pendiente' });
    adminView.renderSolicitudesPassword(solicitudes || []);
  } catch {
    contenedor.innerHTML = '<p class="campo-nota">No se pudieron cargar las solicitudes.</p>';
  }
}

/** Solicitudes de baja (solo administración). */
async function cargarSolicitudesBaja() {
  const caja = document.getElementById('solicitudesBajaBox');
  const contenedor = document.getElementById('solicitudesBajaLista');
  if (!caja || !contenedor) return;
  const permitido = sesion.esAlgunaAdmin();
  caja.classList.toggle('u-oculto', !permitido);
  if (!permitido) return;
  try {
    const { solicitudes } = await bajaService.listar({ estado: 'pendiente' });
    adminView.renderSolicitudesBaja(solicitudes || []);
  } catch {
    contenedor.innerHTML = '<p class="campo-nota">No se pudieron cargar las solicitudes.</p>';
  }
}

/** Solicitudes de alta de cuentas (solo administración). */
async function cargarSolicitudesAlta() {
  const caja = document.getElementById('solicitudesAltaBox');
  const contenedor = document.getElementById('solicitudesAltaLista');
  if (!caja || !contenedor) return;
  const permitido = sesion.esAlgunaAdmin();
  caja.classList.toggle('u-oculto', !permitido);
  if (!permitido) return;
  try {
    const { solicitudes } = await altaService.listar({ estado: 'pendiente' });
    adminView.renderSolicitudesAlta(solicitudes || []);
  } catch {
    contenedor.innerHTML = '<p class="campo-nota">No se pudieron cargar las solicitudes.</p>';
  }
}

/** Selector de estados y municipios del panel de estadísticas. */
function prepararSelectorStats() {
  // Se recrea cada vez que se abre la pestaña: así toma el catálogo actual
  // (las 32 entidades) y no se queda con el que hubiera al primer render.
  const activo = store.estado.municipioActivo?.id;
  // Un funcionario municipal no debe ver «Añadir un estado» ni «Todos los
  // estados»: su selector se queda en modo municipios.
  const soloMunicipios = store.estado.alcance?.modo === 'municipios';
  selectorStats = crearSelectorTerritorial({
    contenedor: 'statsTerritorio',
    municipios: store.estado.municipios || [],
    seleccionados: filtrosStats?.municipios || (activo ? [activo] : []),
    estados: soloMunicipios ? [] : filtrosStats?.estados || [],
    modo: soloMunicipios ? 'municipios' : 'ambos',
    catalogoEstados: soloMunicipios ? [] : estadosDelAlcance()
  });
  actualizarNotaStats();
}

function actualizarNotaStats() {
  const nota = document.getElementById('statsFiltroNota');
  if (!nota) return;
  const municipios = selectorStats?.municipios() || [];
  const estados = selectorStats?.estados() || [];
  if (store.estado.alcance?.modo === 'municipios') {
    nota.textContent = municipios.length
      ? `${municipios.length} municipio(s) de tu ámbito seleccionados. No puedes consultar otros territorios.`
      : 'Solo puedes consultar los municipios que tienes asignados.';
    return;
  }
  nota.textContent = !municipios.length && !estados.length
    ? 'Mostrando todo tu ámbito territorial.'
    : `${municipios.length} municipio(s) y ${estados.length} estado(s) seleccionados.`;
}

/** Catálogo de municipios visibles con incidencias, tickets, sugerencias y personal. */
async function cargarResumenMunicipios() {
  const { municipios } = await catalogosService.resumenMunicipios();
  // Un funcionario de un solo municipio no debe ver el selector ni el filtro
  // nacional: solo la ficha de su municipio.
  const municipal =
    store.estado.alcance?.modo === 'municipios' && (municipios || []).length <= 1;
  document.getElementById('municipioActivoBox')?.classList.toggle('u-oculto', municipal);
  document.getElementById('municipiosFiltroBox')?.classList.toggle('u-oculto', municipal);
  adminView.renderMunicipios(municipios, store.estado.municipioActivo?.id, { municipal });
}

async function cargarSesiones() {
  const { sesiones } = await sesionesService.listar();
  adminView.renderSesiones(sesiones);
}

async function cargarAuditoria() {
  const filtros = {
    username: document.getElementById('auditoriaUsuario')?.value.trim() || '',
    accion: document.getElementById('auditoriaAccion')?.value.trim() || '',
    desde: document.getElementById('auditoriaDesde')?.value || '',
    hasta: document.getElementById('auditoriaHasta')?.value || ''
  };
  const { registros } = await auditoriaService.listar(filtros);
  adminView.renderAuditoria(registros || []);
}

async function cargarSolicitudesAcceso() {
  const { solicitudes } = await solicitudesAccesoService.listar();
  adminView.renderSolicitudesAcceso(solicitudes);
}

async function cargarTicketsAdmin() {
  // El acceso rápido desde Municipios deja un filtro de una sola vez.
  const municipio = store.estado.filtroTicketsMunicipio || null;
  if (municipio) store.actualizar({ filtroTicketsMunicipio: null });
  const { tickets } = await ticketsService.listar({ municipio });
  adminView.renderTicketsAdmin(tickets);
}

async function cargarConfigNotificaciones() {
  const { eventos } = await notificacionesService.configuracion();
  adminView.renderConfigNotificaciones(eventos, store.estado.municipios || []);
}

let staffReglas = [];

async function cargarReglasTickets() {
  const [{ reglas }, { usuarios }] = await Promise.all([
    ticketsService.reglas(),
    catalogosService.usuarios('personal')
  ]);
  staffReglas = usuarios || [];
  const municipios = store.estado.municipios || [];
  adminView.prepararFormRegla(municipios, staffReglas);
  adminView.renderReglasTickets(reglas, municipios, staffReglas);
}

/**
 * Abre el panel de control, opcionalmente en una pestaña concreta. Devuelve
 * una promesa que termina cuando la pestaña ya cargó; es la base de los
 * enlaces profundos de las notificaciones.
 */
export async function abrirPanel(tabInicial = null) {
  if (!sesion.esEmpleado()) {
    toast('No tienes permiso para acceder al panel', 'err');
    return false;
  }
  aplicarTamanoPanel(tamanoPanelGuardado());
  loading(true, 'Cargando panel…');
  try {
    // La matriz de permisos es la única fuente de verdad de la UI.
    document.querySelectorAll('#modalAdmin .admin-tab[data-permiso]').forEach((tab) => {
      const soloAdmin = tab.dataset.valor === 'notificaciones' && !sesion.esAdmin();
      const permitido = sesion.puede(tab.dataset.permiso) && !soloAdmin;
      tab.classList.toggle('u-oculto', !permitido);
      tab.disabled = !permitido;
    });
    document
      .getElementById('btnRolesEspeciales')
      ?.classList.toggle('u-oculto', !sesion.esAdmin());
    document
      .getElementById('solicitudesPermisosBox')
      ?.classList.toggle('u-oculto', !sesion.puede('ver_solicitudes_permisos'));
    document
      .getElementById('solicitudesPasswordBox')
      ?.classList.toggle('u-oculto', !sesion.puede('revelar_password_usuarios'));
    document
      .getElementById('solicitudesBajaBox')
      ?.classList.toggle('u-oculto', !sesion.esAlgunaAdmin());
    document
      .getElementById('solicitudesAltaBox')
      ?.classList.toggle('u-oculto', !sesion.esAlgunaAdmin());
    const visibles = [
      ...document.querySelectorAll('#modalAdmin .admin-tab[data-permiso]:not(.u-oculto)')
    ];
    if (!visibles.length) {
      toast('Tu cuenta no tiene permiso para ninguna sección del panel', 'err');
      return false;
    }
    const pedida = tabInicial
      ? document.querySelector(
          `#modalAdmin .admin-tab[data-valor="${tabInicial}"]:not(.u-oculto)`
        )
      : null;
    const inicial =
      pedida ||
      document.querySelector('#modalAdmin .admin-tab[data-valor="stats"]:not(.u-oculto)') ||
      visibles[0];
    abrirModal('modalAdmin');
    adminView.activarTab(inicial?.dataset.valor || 'stats');
    if (inicial) await abrirTab(inicial.dataset.valor);
    // Los enlaces a una solicitud concreta no necesitan cargar tipos ni la
    // lista completa de cuentas antes de mostrar su resumen.
    if (tabInicial !== 'solicitudes-informe') {
      if (sesion.puede('ver_tipos')) await aplicacion.cargarTipos();
      if (sesion.puede('ver_usuarios')) {
        await aplicacion.cargarUsuarios(
          document.getElementById('usuariosTipo')?.value || 'personal'
        );
      }
    }
    adminView.activarTab(inicial?.dataset.valor || 'stats');
    return true;
  } finally {
    loading(false);
  }
}

/**
 * Lleva la vista a la cuenta o a la solicitud concreta dentro de la pestaña
 * Usuarios y la resalta unos segundos. Es lo que hace que el clic en un aviso
 * deje a la vista la acción pendiente y no solo la pestaña.
 */
export async function enfocarSolicitud({
  usuarioId = null,
  bajaId = null,
  passwordId = null,
  altaId = null
} = {}) {
  const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const limpio = (valor) => String(valor || '').replace(/["\\]/g, '');
  const resaltar = (selector) => {
    const fila = document.querySelector(selector);
    if (!fila) return false;
    fila.classList.add('fila-destacada');
    fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => fila.classList.remove('fila-destacada'), 8000);
    return true;
  };

  await esperar(300);
  if (bajaId) {
    document.getElementById('solicitudesBajaBox')?.classList.remove('u-oculto');
    resaltar(`#solicitudesBajaLista tr[data-solicitud="${limpio(bajaId)}"]`);
  }
  if (passwordId) {
    document.getElementById('solicitudesPasswordBox')?.classList.remove('u-oculto');
    resaltar(`#solicitudesPasswordLista tr[data-solicitud="${limpio(passwordId)}"]`);
  }
  if (altaId) {
    document.getElementById('solicitudesAltaBox')?.classList.remove('u-oculto');
    resaltar(`#solicitudesAltaLista tr[data-solicitud="${limpio(altaId)}"]`);
  }
  if (usuarioId) {
    const selectorTipo = document.getElementById('usuariosTipo');
    if (selectorTipo && selectorTipo.value !== 'personal') {
      selectorTipo.value = 'personal';
      await aplicacion.cargarUsuarios('personal');
      await esperar(150);
    }
    resaltar(`#usuariosLista tr[data-usuario="${limpio(usuarioId)}"]`);
  }
}

export function registrar() {
  const buscarConRetraso = debounce(() => pintarPanelIncidencias(), 200);

  registrarAcciones({
    'admin:abrir': () => intentar(() => abrirPanel()),

    'admin:cerrar': () => cerrarModal('modalAdmin'),

    /* -------------------- cuentas del personal -------------------- */

    /** Alta: abre el modal vacío (el panel de administración queda detrás). */
    'admin:usuarioNuevo': () =>
      intentar(async () => {
        if (!sesion.puede('crear_usuarios')) {
          toast('Tu cuenta no puede crear cuentas', 'err');
          return;
        }
        await cargarRolesEspeciales();
        await cargarCatalogoRoles();
        const claves = await clavesParaAlta();
        const esAdmin = sesion.esAlgunaAdmin();
        adminView.prepararModalUsuario({
          municipios: store.estado.municipios || [],
          estados: estadosDelAlcance(),
          claves,
          roles: { integrados: rolesIntegrados, propios: rolesPropios },
          permiteClaves: esAdmin,
          permitePassword: true,
          permiteRol: esAdmin,
          permiteTerritorio: esAdmin,
          permitePermisos: esAdmin,
          textoTerritorioFijo: esAdmin
            ? ''
            : `La cuenta quedará en tus municipios: ${municipiosDelActor().join(', ') || 'sin asignar'}.`
        });
        adminView.limitarRolesAdmin(!sesion.esAdmin());
        abrirModal('modalUsuario', { nested: true });
      }),

    /** Edición: rellena el modal con la cuenta elegida en la tabla. */
    'admin:usuarioEditar': ({ id }) =>
      intentar(async () => {
        if (!sesion.puede('editar_usuarios')) {
          toast('Tu cuenta no puede editar cuentas', 'err');
          return;
        }
        const usuario = (store.estado.usuarios || []).find((u) => u.id === id);
        if (!usuario) {
          toast('No se encontró esa cuenta, recarga el panel', 'err');
          return;
        }
        await cargarRolesEspeciales();
        await cargarCatalogoRoles();
        const esAdmin = sesion.esAlgunaAdmin();
        adminView.prepararModalUsuario({
          usuario,
          municipios: store.estado.municipios || [],
          estados: estadosDelAlcance(),
          roles: { integrados: rolesIntegrados, propios: rolesPropios },
          permiteClaves: esAdmin,
          permitePassword: esAdmin,
          permiteRol: esAdmin,
          permiteTerritorio: esAdmin,
          permitePermisos: esAdmin,
          textoTerritorioFijo: esAdmin
            ? ''
            : 'El rol, el territorio, los permisos y la contraseña los gestiona la administración. Aquí solo puedes cambiar el nombre completo.'
        });
        adminView.limitarRolesAdmin(!sesion.esAdmin());
        abrirModal('modalUsuario', { nested: true });
      }),

    /** El rol decide si el municipio es obligatorio (funcionario) o no (admin). */
    'admin:usuarioRol': () => {
      adminView.actualizarNotaMunicipioUsuario();
      adminView.renderSelectRolEspecial();
      adminView.renderPermisosCuenta(null);
    },

    /** Una clave elegida rellena rol, territorio y permisos de la cuenta nueva. */
    'admin:usuarioClave': () => {
      const clave = adminView.claveUsuarioSeleccionada();
      if (clave) adminView.aplicarClaveFormulario(clave);
      else adminView.limpiarClaveFormulario();
    },

    /* ------------- roles del sistema, roles propios y especiales ------------- */
    'roles:abrir': () =>
      intentar(async () => {
        await Promise.all([cargarRolesEspeciales(), cargarCatalogoRoles()]);
        adminView.prepararFormRol(null);
        abrirModal('modalRolesEspeciales', { nested: true });
      }),
    'roles:desdeUsuario': () =>
      intentar(async () => {
        // Se abre encima del alta: el formulario de usuario queda detrás con
        // todos sus datos y se recupera al aplicar el rol.
        await cargarCatalogoRoles();
        adminView.prepararRolDesdeUsuario(adminView.rolPlantillaActual(), 'especial');
        abrirModal('modalRolesEspeciales', { nested: true });
      }),
    'roles:nuevo': () =>
      adminView.prepararFormRol(null, {
        // «Limpiar» siempre deja un formulario nuevo. Si se venía de editar un
        // rol del sistema, no debe quedarse en modo integrado (bloqueaba el
        // selector de plantilla y el guardado).
        tipo:
          document.getElementById('rolEspecialTipo')?.value === 'especial'
            ? 'especial'
            : 'propio'
      }),
    'roles:editar': ({ id }) => adminView.prepararFormRol(adminView.rolPorId(id)),
    'roles:editarSistema': ({ id }) => {
      const rol = adminView.rolSistemaPorId(id);
      if (!rol) return toast('No se encontró ese rol, recarga el panel', 'err');
      adminView.prepararFormRol(rol, { tipo: 'integrado' });
    },
    'roles:editarPropio': ({ id }) => {
      const rol = adminView.rolPropioPorId(id);
      if (!rol) return toast('No se encontró ese rol, recarga el panel', 'err');
      adminView.prepararFormRol(rol, { tipo: 'propio' });
    },
    'roles:guardar': () =>
      intentar(async () => {
        const datos = adminView.valoresRolForm();
        if (!datos.nombre) return toast('Escribe un nombre para el rol', 'err');
        let guardado = null;
        if (datos.tipo === 'integrado') {
          guardado = (
            await rolesService.actualizarRol(datos.id, {
              descripcion: datos.descripcion,
              permisos: datos.permisos
            })
          ).rol;
        } else if (datos.tipo === 'propio') {
          const cuerpo = {
            etiqueta: datos.nombre,
            descripcion: datos.descripcion,
            rolPlantilla: datos.rolBase,
            territorio: datos.territorio,
            permisos: datos.permisos,
            activo: datos.activo
          };
          guardado = datos.id
            ? (await rolesService.actualizarRol(datos.id, cuerpo)).rol
            : (await rolesService.crearRol(cuerpo)).rol;
        } else if (datos.id) {
          guardado = (await rolesService.actualizar(datos.id, datos)).rol;
        } else {
          guardado = (await rolesService.crear(datos)).rol;
        }
        await Promise.all([cargarRolesEspeciales(), cargarCatalogoRoles()]);
        adminView.prepararFormRol(null);
        toast(datos.id ? 'Rol actualizado' : 'Rol creado', 'ok');
        // «Aplicar a esta cuenta» solo tiene sentido si el alta sigue abierta.
        const altaAbierta = document
          .getElementById('modalUsuario')
          ?.classList.contains('show');
        if (guardado && altaAbierta) adminView.ofrecerAplicarRol(guardado);
      }),
    'roles:usarEnUsuario': () => {
      const rol = adminView.rolRecienCreado();
      if (!rol) return toast('Guarda el rol propio antes de aplicarlo', 'err');
      adminView.aplicarRolAlFormulario(rol);
      cerrarModal('modalRolesEspeciales');
      toast(`Rol «${rol.etiqueta || rol.nombre}» aplicado a la cuenta`, 'ok');
    },
    'roles:restablecer': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Restablecer este rol a los permisos de fábrica?'))) return;
        await rolesService.restablecerRol(id);
        await cargarCatalogoRoles();
        adminView.prepararFormRol(null);
        toast('Rol restablecido a fábrica', 'ok');
      }),
    'roles:eliminarPropio': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Eliminar este rol propio? Las cuentas deben tener otro rol asignado.'))) return;
        await rolesService.eliminarRol(id);
        await cargarCatalogoRoles();
        toast('Rol eliminado', 'ok');
      }),
    'roles:eliminar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Eliminar este rol especial? Las cuentas que lo tengan asignado lo perderán.'))) return;
        await rolesService.eliminar(id);
        await cargarRolesEspeciales();
        adminView.renderListaRoles(rolesEspeciales);
        toast('Rol eliminado', 'ok');
      }),

    /* ------------------------- contraseña (V2.11) ------------------------- */
    'password:ver': ({ id }) =>
      intentar(async () => {
        if (!sesion.puede('revelar_password_usuarios')) {
          toast('Tu cuenta no puede consultar contraseñas', 'err');
          return;
        }
        const usuario = (store.estado.usuarios || []).find((u) => u.id === id);
        if (!usuario) return toast('No se encontró esa cuenta', 'err');
        loading(true, 'Consultando contraseña…');
        try {
          const { password } = await catalogosService.passwordUsuario(id);
          adminView.mostrarPasswordUsuario({ usuario, password });
          abrirModal('modalPasswordUsuario', { nested: true });
        } finally {
          loading(false);
        }
      }),
    'password:alternar': () => adminView.alternarPasswordVisible(),
    'password:copiar': async () => {
      const texto = adminView.passwordVisibleTexto();
      if (!texto) return toast('Pulsa «Mostrar» antes de copiar', 'err');
      try {
        await navigator.clipboard.writeText(texto);
        toast('Contraseña copiada', 'ok');
      } catch {
        toast('No se pudo copiar: revisa los permisos del navegador', 'err');
      }
    },
    'password:restablecer': () =>
      intentar(async () => {
        const usuario = adminView.passwordUsuarioActual();
        if (!usuario) return;
        if (
          !(await preguntar(
            `¿Restablecer la contraseña de ${usuario.nombre}? Se generará una temporal y su consulta quedará en auditoría.`
          ))
        ) {
          return;
        }
        const resultado = await catalogosService.restablecerPassword(usuario.id);
        adminView.mostrarPasswordUsuario({
          usuario,
          password: resultado.password,
          generada: true
        });
        toast('Contraseña restablecida', 'ok');
      }),

    /** Aprueba una solicitud de contraseña y muestra la temporal una vez. */
    'password:aprobarSolicitud': ({ id }) =>
      intentar(async () => {
        const resultado = await passwordService.aprobar(id, 'Atendida desde el panel');
        await cargarSolicitudesPassword();
        const cuenta = resultado?.solicitud || {};
        adminView.mostrarPasswordUsuario({
          usuario: { nombre: cuenta.nombre || cuenta.username, id: cuenta.usuarioId },
          password: resultado.password,
          generada: true
        });
        abrirModal('modalPasswordUsuario', { nested: true });
        toast('Contraseña temporal generada', 'ok');
      }),
    'password:rechazarSolicitud': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Rechazar la solicitud de cambio de contraseña?'))) return;
        await passwordService.rechazar(id, 'Rechazado desde el panel');
        await cargarSolicitudesPassword();
        toast('Solicitud rechazada', 'info');
      }),

    /**
     * Un funcionario no cambia contraseñas: pide el restablecimiento de una
     * cuenta de su ámbito y la administración se lo entrega por la campana.
     */
    'password:solicitarCuenta': ({ id }) =>
      intentar(async () => {
        const usuario = (store.estado.usuarios || []).find((u) => u.id === id);
        if (!usuario) return toast('No se encontró esa cuenta', 'err');
        adminView.prepararModalSolicitudPassword(usuario);
        abrirModal('modalSolicitudPassword', { nested: true });
      }),
    'password:enviarSolicitudCuenta': () =>
      intentar(async () => {
        const datos = adminView.valoresSolicitudPassword();
        if (!datos.usuarioId) return;
        if (datos.motivo.length < 10) {
          return toast('Explica en al menos 10 caracteres por qué se necesita el cambio', 'err');
        }
        await passwordService.crear(datos);
        cerrarModal('modalSolicitudPassword');
        toast('Solicitud enviada: la nueva contraseña llegará a tu campana', 'ok');
      }),

    /* ------------------------- ayuda de permisos ------------------------- */
    'permisos:ayuda': ({ valor }) => {
      adminView.renderAyudaPermiso(valor);
      abrirModal('modalAyudaPermiso', { nested: true });
    },

    /* ------------------- solicitudes de baja (V2.11.1) ------------------- */
    'baja:solicitar': ({ id }) =>
      intentar(async () => {
        const usuario = (store.estado.usuarios || []).find((u) => u.id === id);
        if (!usuario) return toast('No se encontró esa cuenta', 'err');
        adminView.prepararModalBaja(usuario);
        abrirModal('modalBajaUsuario', { nested: true });
      }),
    'baja:enviar': () =>
      intentar(async () => {
        const datos = adminView.valoresBajaForm();
        if (!datos.usuarioId) return;
        if (datos.motivo.length < 10) {
          return toast('Explica en al menos 10 caracteres por qué se da de baja', 'err');
        }
        await bajaService.crear(datos);
        cerrarModal('modalBajaUsuario');
        toast('Solicitud de baja enviada al administrador', 'ok');
      }),
    'baja:aprobar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Aplicar la baja? La cuenta se desactivará y no podrá entrar.'))) {
          return;
        }
        await bajaService.aprobar(id, 'Aplicada desde el panel');
        await Promise.all([cargarSolicitudesBaja(), aplicacion.cargarUsuarios('personal')]);
        toast('Cuenta dada de baja', 'ok');
      }),
    'baja:rechazar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Rechazar esta solicitud de baja?'))) return;
        await bajaService.rechazar(id, 'Rechazada desde el panel');
        await cargarSolicitudesBaja();
        toast('Solicitud rechazada', 'info');
      }),

    /* ------------------- solicitudes de alta (V2.11.3) ------------------- */
    'alta:solicitar': () =>
      intentar(async () => {
        if (!sesion.puede('crear_usuarios')) {
          toast('Tu cuenta no puede solicitar altas de usuarios', 'err');
          return;
        }
        adminView.prepararModalAlta();
        abrirModal('modalSolicitudAlta', { nested: true });
      }),
    'alta:enviar': () =>
      intentar(async () => {
        const datos = adminView.valoresAltaForm();
        if (datos.nombre.length < 3) return toast('Escribe el nombre completo', 'err');
        if (!/^[a-z0-9._-]{3,60}$/i.test(datos.username)) {
          return toast(
            'El usuario de acceso debe tener entre 3 y 60 letras, números, punto, guion o guion bajo',
            'err'
          );
        }
        await altaService.crear(datos);
        cerrarModal('modalSolicitudAlta');
        toast('Solicitud de alta enviada al administrador', 'ok');
      }),
    'alta:aprobar': ({ id }) =>
      intentar(async () => {
        if (
          !(await preguntar(
            '¿Aprobar esta alta? Se creará la cuenta como funcionario en los municipios del solicitante y la contraseña temporal se le entregará por la campana.'
          ))
        ) {
          return;
        }
        const resultado = await altaService.aprobar(id, 'Aprobada desde el panel');
        await Promise.all([cargarSolicitudesAlta(), aplicacion.cargarUsuarios('personal')]);
        const usuario = resultado?.usuario;
        if (usuario) {
          adminView.mostrarPasswordUsuario({
            usuario,
            password: resultado.password,
            generada: true
          });
          abrirModal('modalPasswordUsuario', { nested: true });
        }
        toast('Cuenta creada; la contraseña se entregó al solicitante', 'ok');
      }),
    'alta:rechazar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Rechazar esta solicitud de alta?'))) return;
        await altaService.rechazar(id, 'Rechazada desde el panel');
        await cargarSolicitudesAlta();
        toast('Solicitud rechazada', 'info');
      }),

    /* ---------------------- solicitudes de permisos --------------------- */
    'permisos:aprobar': ({ id }) =>
      intentar(async () => {
        await permisosService.aprobar(id, 'Aprobado desde el panel');
        await cargarSolicitudesPermisos();
        toast('Permisos aprobados', 'ok');
      }),
    'permisos:rechazar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Rechazar esta solicitud de permisos?'))) return;
        await permisosService.rechazar(id, 'Rechazado desde el panel');
        await cargarSolicitudesPermisos();
        toast('Solicitud rechazada', 'info');
      }),

    /** Crea o actualiza la cuenta y repinta la tabla. */
    'admin:usuarioGuardar': () =>
      intentar(async () => {
        const datosPrevios = adminView.valoresUsuarioForm();
        const permisoAccion = datosPrevios.id ? 'editar_usuarios' : 'crear_usuarios';
        if (!sesion.puede(permisoAccion)) {
          toast('Tu cuenta no puede gestionar cuentas', 'err');
          return;
        }

        const datos = datosPrevios;
        const esAdmin = sesion.esAlgunaAdmin();
        if (!datos.nombre) return toast('Escribe el nombre completo', 'err');

        let envio;
        if (!esAdmin) {
          // V2.11.1: un funcionario solo cambia el nombre completo. Al crear
          // una cuenta, el servidor fija el rol funcionario y el territorio del
          // propio funcionario; no se envían rol, permisos ni territorio.
          if (datos.id) {
            envio = { nombre: datos.nombre };
          } else {
            if (!datos.username) return toast('Escribe el usuario de acceso', 'err');
            if (!datos.password || datos.password.length < 8) {
              return toast('La contraseña debe tener al menos 8 caracteres', 'err');
            }
            envio = {
              username: datos.username,
              nombre: datos.nombre,
              password: datos.password,
              rol: 'funcionario'
            };
          }
        } else {
          if (!datos.id && !datos.username) return toast('Escribe el usuario de acceso', 'err');
          if (
            !sesion.esAdmin() &&
            ['admin', 'admin_estatal', 'admin_municipal'].includes(datos.rol)
          ) {
            return toast('Solo el administrador maestro puede crear administradores', 'err');
          }
          // Con una clave elegida, el rol y el territorio vienen de ella y el
          // servidor los vuelve a validar; no se exige repetirlos en el formulario.
          if (!datos.claveId) {
            if (datos.rol === 'funcionario' && !datos.municipios.length) {
              return toast('Elige al menos un municipio para el funcionario', 'err');
            }
            if (datos.rol === 'admin_municipal' && !datos.municipios.length) {
              return toast('Elige al menos un municipio para el administrador municipal', 'err');
            }
            if (datos.rol === 'admin_estatal' && !datos.estados.length) {
              return toast('Elige al menos un estado para el administrador estatal', 'err');
            }
            if (datos.rol === 'auditor' && !datos.municipios.length && !datos.estados.length) {
              return toast('Elige al menos un municipio o estado para el auditor', 'err');
            }
            if (datos.rol === 'soporte' && !datos.municipios.length && !datos.estados.length) {
              return toast('Elige al menos un municipio o estado para soporte', 'err');
            }
            if (
              (datos.rol === 'enlace_estatal' || datos.rol === 'enlace_federal') &&
              !datos.estados.length
            ) {
              return toast('Elige al menos un estado para el enlace', 'err');
            }
          }
          if ((!datos.id || datos.password) && datos.password.length < 8) {
            return toast('La contraseña debe tener al menos 8 caracteres', 'err');
          }

          // En edición, la contraseña vacía significa «no la cambies».
          envio = {
            nombre: datos.nombre,
            rol: datos.rol,
            municipios: datos.municipios,
            estados: datos.estados,
            puedeEscribir:
              ['funcionario', 'admin', 'admin_estatal', 'admin_municipal'].includes(datos.rol)
                ? datos.puedeEscribir
                : false,
            correo: datos.correo,
            activo: datos.activo,
            permisos: datos.permisos
          };
          if (datos.rolPropioId) envio.rolPropioId = datos.rolPropioId;
          if (datos.id && datos.rolPropioId === null) envio.rolPropioId = null;
          if (datos.password) envio.password = datos.password;
          if (!datos.id) {
            envio.username = datos.username;
            envio.password = datos.password;
            // Si se eligió una clave, el servidor toma de ella rol, territorio y
            // permisos; los campos del formulario quedan como vista previa.
            if (datos.claveId) envio.claveId = datos.claveId;
          }
          // Clave de acceso del personal (segundo factor del login). Solo la
          // administración genera claves: un funcionario usa la suya.
          envio.generarClave = datos.generarClave === true;
          if (envio.generarClave) {
            envio.claveUsosMaximos = datos.claveUsosMaximos;
            envio.claveExpiraEn = datos.claveExpiraEn;
          }
        }

        loading(true, datos.id ? 'Guardando cuenta…' : 'Creando cuenta…');
        try {
          const resultado = await aplicacion.guardarUsuario(datos.id, envio);
          const usuario = resultado.usuario;
          cerrarModal('modalUsuario');
          toast(
            datos.id ? `Cuenta de ${usuario.nombre} actualizada` : `Cuenta de ${usuario.nombre} creada`,
            'ok'
          );
          if (resultado.clave?.codigo) {
            adminView.mostrarClaveGenerada(resultado.clave);
            abrirModal('modalClaveGenerada', { nested: true });
            cargarClaves().catch(() => {});
          }
        } finally {
          loading(false);
        }
      }),

    /** Baja lógica de una cuenta del personal. */
    'admin:usuarioEliminar': ({ id }) =>
      intentar(async () => {
        if (!sesion.puede('eliminar_usuarios')) {
          toast('Tu cuenta no puede desactivar cuentas', 'err');
          return;
        }
        const usuario = (store.estado.usuarios || []).find((u) => u.id === id);
        if (!usuario) return toast('No se encontró esa cuenta', 'err');
        if (
          !(await preguntar(
            `¿Desactivar la cuenta de ${usuario.nombre}? Dejará de poder iniciar sesión, pero su historial se conserva.`
          ))
        ) {
          return;
        }
        await aplicacion.eliminarUsuario(id);
        toast('Cuenta desactivada', 'ok');
      }),

    /** Devuelve a la vida una cuenta dada de baja. */
    'admin:usuarioReactivar': ({ id }) =>
      intentar(async () => {
        if (!sesion.esAlgunaAdmin() || !sesion.puede('editar_usuarios')) {
          toast('Solo la administración puede reactivar cuentas', 'err');
          return;
        }
        const usuario = (store.estado.usuarios || []).find((u) => String(u.id) === String(id));
        if (!usuario) return toast('No se encontró esa cuenta', 'err');
        if (
          !(await preguntar(
            `¿Reactivar la cuenta de ${usuario.nombre}? Volverá a poder iniciar sesión con su usuario y contraseña.`
          ))
        ) {
          return;
        }
        await catalogosService.reactivarUsuario(id);
        await aplicacion.cargarUsuarios(document.getElementById('usuariosTipo')?.value || 'personal');
        toast('Cuenta reactivada', 'ok');
      }),

    'admin:usuariosTipo': ({ valor }) =>
      intentar(() => aplicacion.cargarUsuarios(valor === 'ciudadanos' ? 'ciudadanos' : 'personal')),

    'claves:abrir': () => {
      if (!sesion.puede('crear_claves')) {
        toast('Tu cuenta no puede crear claves', 'err');
        return;
      }
      adminView.prepararModalClave(
        store.estado.municipios || [],
        store.estado.estados || []
      );
      abrirModal('modalClave', { nested: true });
    },

    'claves:rol': () =>
      adminView.renderPermisosClave(document.getElementById('claveRol')?.value || 'funcionario'),

    /** Configuración global de notificaciones (pestaña del panel). */
    'notificacionesAdmin:recargar': () => intentar(() => cargarConfigNotificaciones()),

    'notificacionesAdmin:probar': () =>
      intentar(async () => {
        await notificacionesService.probar();
        toast('Aviso de prueba enviado a tu campana', 'ok');
        await aplicacion.recargarNotificaciones();
      }),

    'notificacionesAdmin:guardar': ({ id }) =>
      intentar(async () => {
        const datos = adminView.valoresConfigNotificacion(id);
        if (!datos) return;
        if (datos.alcance === 'municipios' && !datos.municipios.length) {
          return toast('Elige al menos un municipio para ese alcance', 'err');
        }
        if (datos.alcance === 'estados' && !datos.estados.length) {
          return toast('Elige al menos un estado para ese alcance', 'err');
        }
        await notificacionesService.guardarConfiguracion(id, datos);
        toast('Regla de notificación guardada', 'ok');
      }),

    /** Asignación automática de tickets. */
    'reglas:crear': () =>
      intentar(async () => {
        if (!sesion.esAdmin()) return toast('Solo un administrador gestiona las reglas', 'err');
        const datos = adminView.valoresRegla();
        if (!datos.asignarA && !datos.asignarRol) {
          return toast('Elige una persona o una cola por rol', 'err');
        }
        if (!datos.municipioId && !datos.prioridad) {
          return toast('Indica municipio o prioridad para la regla', 'err');
        }
        await ticketsService.crearRegla(datos);
        adminView.limpiarReglaSimulada();
        await cargarReglasTickets();
        toast('Regla de asignación creada', 'ok');
      }),

    'reglas:simular': () => {
      if (!sesion.esAdmin()) return toast('Solo un administrador gestiona las reglas', 'err');
      const datos = adminView.valoresRegla();
      if (!datos.asignarA && !datos.asignarRol) {
        return toast('Elige una persona o una cola por rol', 'err');
      }
      if (!datos.municipioId && !datos.prioridad) {
        return toast('Indica municipio o prioridad para la regla', 'err');
      }
      adminView.renderReglaSimulada(datos, store.estado.municipios || [], staffReglas);
      toast('Simulación lista: no se guardó ninguna regla', 'ok');
    },

    'reglas:eliminar': ({ id }) =>
      intentar(async () => {
        if (!sesion.esAdmin()) return toast('Solo un administrador gestiona las reglas', 'err');
        if (!(await preguntar('¿Eliminar esta regla de asignación?'))) return;
        await ticketsService.eliminarRegla(id);
        await cargarReglasTickets();
        toast('Regla eliminada', 'ok');
      }),

    'claves:guardar': () =>
      intentar(async () => {
        if (!sesion.puede('crear_claves')) {
          toast('Tu cuenta no puede crear claves', 'err');
          return;
        }
        if (creandoClave) return;
        const datos = adminView.valoresClaveForm();
        if (!datos.nombre) return toast('Escribe un nombre para la clave', 'err');
        if (!datos.municipios.length && !datos.estados.length) {
          return toast('Elige al menos un estado o un municipio', 'err');
        }

        creandoClave = true;
        const boton = document.querySelector('[data-action="claves:guardar"]');
        if (boton) {
          boton.disabled = true;
          boton.setAttribute('aria-busy', 'true');
        }
        loading(true, 'Generando clave…');
        try {
          const { clave } = await clavesService.crear(datos);
          cerrarModal('modalClave');
          toast('Clave generada', 'ok');
          // Se pinta de inmediato y la recarga completa queda en segundo plano.
          adminView.agregarClaveLista(clave);
          cargarClaves().catch(() => {});
        } finally {
          creandoClave = false;
          loading(false);
          if (boton) {
            boton.disabled = false;
            boton.removeAttribute('aria-busy');
          }
        }
      }),

    /** Copia una clave al portapapeles (lista de claves o modal de alta). */
    'claves:copiar': async ({ valor }) => {
      const codigo = valor || adminView.claveGeneradaTexto();
      if (!codigo) return;
      try {
        await navigator.clipboard.writeText(codigo);
        toast('Clave copiada', 'ok');
      } catch {
        toast(`Copia la clave a mano: ${codigo}`, 'err');
      }
    },

    'avisosClave:abrir': ({ id }) =>
      intentar(async () => {
        const clave = await claveParaAvisos(id);
        if (!clave) return toast('No se encontró la clave', 'err');
        adminView.prepararModalAvisosClave(clave, store.estado.municipios || []);
        abrirModal('modalAvisosClave', { nested: true });
      }),

    'avisosClave:guardar': () =>
      intentar(async () => {
        if (!sesion.puede('editar_avisos_clave')) {
          toast('Tu cuenta no puede configurar avisos', 'err');
          return;
        }
        const id = document.getElementById('avisosClaveId')?.value;
        if (!id) return;
        const datos = adminView.valoresAvisosClave();
        await clavesService.guardarNotificaciones(id, datos);
        cerrarModal('modalAvisosClave');
        await cargarAvisosClave();
        toast('Permiso de avisos actualizado', 'ok');
      }),

    'avisosClave:revocar': ({ id }) =>
      intentar(async () => {
        if (!sesion.puede('editar_avisos_clave')) {
          toast('Tu cuenta no puede revocar avisos', 'err');
          return;
        }
        if (
          !(await preguntar(
            '¿Revocar los avisos de esta clave? La clave seguirá sirviendo para iniciar sesión, pero dejará de recibir notificaciones.'
          ))
        ) {
          return;
        }
        await clavesService.revocarNotificaciones(id);
        await cargarAvisosClave();
        toast('Avisos de la clave revocados', 'ok');
      }),

    'avisosClave:reactivar': ({ id }) =>
      intentar(async () => {
        if (!sesion.puede('editar_avisos_clave')) {
          toast('Tu cuenta no puede reactivar avisos', 'err');
          return;
        }
        await clavesService.reactivarNotificaciones(id);
        await cargarAvisosClave();
        toast('Avisos de la clave reactivados', 'ok');
      }),

    'avisosClave:recargar': () => intentar(() => cargarAvisosClave()),
    'avisosClave:filtrar': () =>
      adminView.renderAvisosClave(
        adminView.clavesCargadas(),
        store.estado.municipios || []
      ),

    'claves:eliminar': ({ id }) =>
      intentar(async () => {
        if (!sesion.puede('eliminar_claves')) {
          toast('Tu cuenta no puede eliminar claves', 'err');
          return;
        }
        if (
          !(await preguntar(
            '¿Eliminar esta clave? Se cerrarán todas las sesiones abiertas con ella y no se podrá volver a usar.'
          ))
        ) {
          return;
        }
        const resultado = await clavesService.eliminar(id);
        await cargarClaves();
        await cargarSesiones().catch(() => {});
        const cerradas = resultado.sesionesCerradas?.length || 0;
        toast(
          cerradas
            ? `Clave eliminada · ${cerradas} sesión(es) cerrada(s)`
            : 'Clave eliminada',
          'ok'
        );
      }),

    'auditoria:filtrar': () => intentar(() => cargarAuditoria()),
    'auditoria:recargar': () => intentar(() => cargarAuditoria()),
    'auditoria:limpiar': () =>
      intentar(async () => {
        for (const id of ['auditoriaUsuario', 'auditoriaAccion', 'auditoriaDesde', 'auditoriaHasta']) {
          const campo = document.getElementById(id);
          if (campo) campo.value = '';
        }
        await cargarAuditoria();
      }),

    'sesiones:revocar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Cerrar esta sesión?'))) return;
        await sesionesService.revocar(id);
        await cargarSesiones();
        toast('Sesión revocada', 'ok');
      }),

    'solicitudes:aprobar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Aprobar esta solicitud y crear la cuenta?'))) return;
        const resultado = await solicitudesAccesoService.aprobar(id);
        await cargarSolicitudesAcceso();
        toast(
          `Cuenta ${resultado.usuario?.username || 'creada'} lista${resultado.clave ? ` · clave ${resultado.clave.codigo}` : ''}`,
          'ok'
        );
      }),

    'solicitudes:rechazar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Rechazar esta solicitud?'))) return;
        await solicitudesAccesoService.rechazar(id, 'Rechazada por el administrador');
        await cargarSolicitudesAcceso();
        toast('Solicitud rechazada', 'ok');
      }),

    'tickets:ver': ({ id }) =>
      intentar(async () => {
        const { ticket } = await ticketsService.obtener(id);
        adminView.fijarTicketAdminId(id);
        adminView.renderTicketAdmin(ticket);
        abrirModal('modalTicketAdmin', { nested: true });
      }),

    'tickets:responder': () =>
      intentar(async () => {
        const id = adminView.ticketAdminId();
        const texto = document.getElementById('ticketAdminRespuesta')?.value || '';
        if (!id || !texto.trim()) return toast('Escribe una respuesta', 'err');
        const { ticket } = await ticketsService.responder(id, texto);
        adminView.renderTicketAdmin(ticket);
        await cargarTicketsAdmin();
        toast('Respuesta enviada', 'ok');
      }),

    'tickets:cerrar': () =>
      intentar(async () => {
        const id = adminView.ticketAdminId();
        if (!id) return;
        if (!(await preguntar('¿Cerrar este ticket?'))) return;
        const { ticket } = await ticketsService.cambiarEstado(id, 'cerrado');
        adminView.renderTicketAdmin(ticket);
        await cargarTicketsAdmin();
        toast('Ticket cerrado', 'ok');
      }),

    'tickets:prioridad': ({ valor }) =>
      intentar(async () => {
        const id = adminView.ticketAdminId();
        if (!id || !valor) return;
        const { ticket } = await ticketsService.cambiarPrioridad(id, valor);
        adminView.renderTicketAdmin(ticket);
        await cargarTicketsAdmin();
        toast('Prioridad actualizada', 'ok');
      }),

    'admin:tamanoPanel': ({ valor }) =>
      toast(
        `Panel ${cambiarTamanoPanel(valor)}`,
        'ok'
      ),

    'admin:tab': ({ valor }) =>
      intentar(async () => {
        if (!puedeAbrirTab(valor)) {
          toast('Tu cuenta no tiene permiso para esta sección', 'err');
          return;
        }
        await abrirTab(valor);
      }),

    'admin:filtroMunicipios': () =>
      adminView.renderMunicipios([], store.estado.municipioActivo?.id),

    'municipios:ficha': ({ id }) =>
      intentar(async () => {
        const datos = await catalogosService.fichaMunicipio(id);
        fichaActual = datos;
        const asignar = (campo, valor) => {
          const elemento = document.getElementById(campo);
          if (elemento) elemento.value = valor ?? '';
        };
        document.getElementById('fichaMunicipioId').value = datos.municipio.id;
        document.getElementById('fichaMunicipioTitulo').textContent =
          `Información de ${datos.municipio.nombre}, ${datos.municipio.estado}`;
        const estado = datos.ficha.estado || 'sin_ficha';
        const etiquetas = {
          sin_ficha: 'Sin ficha todavía',
          borrador: 'Borrador',
          pendiente: 'Pendiente de aprobación',
          aprobado: 'Aprobada',
          rechazado: 'Rechazada'
        };
        document.getElementById('fichaMunicipioEstado').textContent =
          `Estado: ${etiquetas[estado] || estado}` +
          (datos.ficha.motivoRechazo ? ` · Motivo: ${datos.ficha.motivoRechazo}` : '');
        asignar('fichaSitioWeb', datos.ficha.sitioWeb);
        asignar('fichaTelefono', datos.ficha.telefono);
        asignar('fichaCorreo', datos.ficha.correo);
        asignar('fichaDireccion', datos.ficha.direccion);
        asignar('fichaHorario', datos.ficha.horario);
        asignar('fichaNotas', datos.ficha.notas);
        document.getElementById('btnGuardarFicha')?.classList.toggle('u-oculto', !datos.puedeEditar);
        document
          .getElementById('btnAprobarFicha')
          ?.classList.toggle('u-oculto', !datos.puedeAprobar || estado !== 'pendiente');
        document
          .getElementById('btnRechazarFicha')
          ?.classList.toggle('u-oculto', !datos.puedeAprobar || estado !== 'pendiente');
        abrirModal('modalFichaMunicipio', { nested: true });
      }),

    'municipios:guardarFicha': () =>
      intentar(async () => {
        const id = document.getElementById('fichaMunicipioId')?.value;
        const datos = {
          sitioWeb: document.getElementById('fichaSitioWeb')?.value || '',
          telefono: document.getElementById('fichaTelefono')?.value || '',
          correo: document.getElementById('fichaCorreo')?.value || '',
          direccion: document.getElementById('fichaDireccion')?.value || '',
          horario: document.getElementById('fichaHorario')?.value || '',
          notas: document.getElementById('fichaNotas')?.value || ''
        };
        const resultado = await catalogosService.guardarFichaMunicipio(id, datos);
        cerrarModal('modalFichaMunicipio');
        toast(
          resultado.ficha.estado === 'aprobado'
            ? 'Ficha aprobada y guardada'
            : 'Ficha enviada a revisión del administrador',
          'ok'
        );
        await cargarResumenMunicipios();
      }),

    'municipios:aprobarFicha': () =>
      intentar(async () => {
        const id = document.getElementById('fichaMunicipioId')?.value;
        await catalogosService.aprobarFichaMunicipio(id);
        cerrarModal('modalFichaMunicipio');
        toast('Ficha municipal aprobada', 'ok');
        await cargarResumenMunicipios();
      }),

    'municipios:rechazarFicha': () =>
      intentar(async () => {
        const id = document.getElementById('fichaMunicipioId')?.value;
        const motivo = window.prompt('Motivo del rechazo (opcional)') || '';
        await catalogosService.rechazarFichaMunicipio(id, motivo);
        cerrarModal('modalFichaMunicipio');
        toast('Ficha rechazada', 'info');
        await cargarResumenMunicipios();
      }),

    'admin:irClaves': ({ id }) =>
      intentar(async () => {
        if (!sesion.puede('ver_claves')) {
          toast('Tu cuenta no puede gestionar claves', 'err');
          return;
        }
        await abrirTab('claves');
        const municipio = (store.estado.municipios || []).find((m) => m.id === id);
        const buscador = document.getElementById('clavesBuscar');
        if (buscador) buscador.value = municipio?.nombre || '';
        await cargarClaves();
      }),

    'claves:recargar': () => intentar(() => cargarClaves()),
    'claves:filtrar': () =>
      adminView.renderClaves(adminView.clavesCargadas(), store.estado.municipios || [], {
        puedeEliminar: sesion.puede('eliminar_claves')
      }),

    'stats:aplicar': () =>
      intentar(async () => {
        filtrosStats = {
          municipios: selectorStats?.municipios() || [],
          estados: selectorStats?.estados() || []
        };
        actualizarNotaStats();
        await aplicacion.cargarEstadisticas(filtrosStats);
      }),

    'stats:limpiar': () =>
      intentar(async () => {
        selectorStats?.limpiar();
        filtrosStats = {};
        actualizarNotaStats();
        await aplicacion.cargarEstadisticas(filtrosStats);
      }),

    /** Acceso rápido desde la tabla de municipios: activa el municipio y abre el módulo. */
    'admin:irMunicipio': ({ id, valor }) =>
      intentar(async () => {
        loading(true, 'Cambiando de municipio…');
        try {
          await aplicacion.cambiarMunicipio(id);
          if (valor === 'tickets') {
            store.actualizar({ filtroTicketsMunicipio: id });
            await abrirTab('tickets');
            return;
          }
          if (valor === 'sugerencias') {
            cerrarModal('modalAdmin');
            await abrirSugerenciasDeMunicipio(id);
            return;
          }
          await abrirTab(valor);
        } finally {
          loading(false);
        }
      }),

    'admin:buscar': () => buscarConRetraso(),

    'admin:verDetalle': ({ id }) => {
      cerrarModal('modalAdmin');
      detalleController.abrirDesdePanel(id);
    },

    'admin:eliminar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Eliminar esta incidencia? Esta acción no se puede deshacer.'))) return;
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
