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
import { rolesService } from '../services/roles.service.js';

let selectorStats = null;
let filtrosStats = null;
let fichaActual = null;

/** Permiso mínimo para ver y cargar cada pestaña del panel. */
export const PERMISO_POR_TAB = {
  stats: 'ver_metricas',
  incidencias: 'ver_incidencias_panel',
  tipos: 'ver_tipos',
  municipios: 'ver_municipios_panel',
  claves: 'gestionar_claves',
  zonas: 'ver_zonas',
  usuarios: 'ver_usuarios',
  solicitudes: 'gestionar_usuarios',
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
        cargarRolesEspeciales()
      ]);
      await cargarSolicitudesPermisos();
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
  adminView.renderClaves(claves, store.estado.municipios || []);
}

let rolesEspeciales = [];

async function cargarRolesEspeciales() {
  const { roles } = await rolesService.listar();
  rolesEspeciales = roles || [];
  adminView.renderRolesEspeciales(rolesEspeciales);
  return rolesEspeciales;
}

async function cargarSolicitudesPermisos() {
  const contenedor = document.getElementById('solicitudesPermisosLista');
  if (!contenedor) return;
  try {
    const { solicitudes } = await permisosService.solicitudes();
    adminView.renderSolicitudesPermisos(solicitudes || []);
  } catch {
    contenedor.innerHTML = '<p class="campo-nota">No se pudieron cargar las solicitudes.</p>';
  }
}

/** Selector de estados y municipios del panel de estadísticas. */
function prepararSelectorStats() {
  // Se recrea cada vez que se abre la pestaña: así toma el catálogo actual
  // (las 32 entidades) y no se queda con el que hubiera al primer render.
  const activo = store.estado.municipioActivo?.id;
  selectorStats = crearSelectorTerritorial({
    contenedor: 'statsTerritorio',
    municipios: store.estado.municipios || [],
    seleccionados: filtrosStats?.municipios || (activo ? [activo] : []),
    estados: filtrosStats?.estados || [],
    modo: 'ambos',
    catalogoEstados: store.estado.estados || []
  });
  actualizarNotaStats();
}

function actualizarNotaStats() {
  const nota = document.getElementById('statsFiltroNota');
  if (!nota) return;
  const municipios = selectorStats?.municipios() || [];
  const estados = selectorStats?.estados() || [];
  nota.textContent = !municipios.length && !estados.length
    ? 'Mostrando todo tu ámbito territorial.'
    : `${municipios.length} municipio(s) y ${estados.length} estado(s) seleccionados.`;
}

/** Catálogo de municipios visibles con incidencias, tickets, sugerencias y personal. */
async function cargarResumenMunicipios() {
  const { municipios } = await catalogosService.resumenMunicipios();
  adminView.renderMunicipios(municipios, store.estado.municipioActivo?.id);
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
          const visibles = [
            ...document.querySelectorAll('#modalAdmin .admin-tab[data-permiso]:not(.u-oculto)')
          ];
          if (!visibles.length) {
            toast('Tu cuenta no tiene permiso para ninguna sección del panel', 'err');
            return;
          }
          const inicial =
            document.querySelector('#modalAdmin .admin-tab[data-valor="stats"]:not(.u-oculto)') ||
            visibles[0];
          if (inicial) await abrirTab(inicial.dataset.valor);
          if (sesion.puede('ver_tipos')) await aplicacion.cargarTipos();
          if (sesion.puede('ver_usuarios')) {
            await aplicacion.cargarUsuarios(
              document.getElementById('usuariosTipo')?.value || 'personal'
            );
          }
          adminView.activarTab(inicial?.dataset.valor || 'stats');
          abrirModal('modalAdmin');
        } finally {
          loading(false);
        }
      }),

    'admin:cerrar': () => cerrarModal('modalAdmin'),

    /* -------------------- cuentas del personal -------------------- */

    /** Alta: abre el modal vacío (el panel de administración queda detrás). */
    'admin:usuarioNuevo': () =>
      intentar(async () => {
        if (!sesion.puede('gestionar_usuarios')) {
          toast('Tu cuenta no puede crear cuentas', 'err');
          return;
        }
        await cargarRolesEspeciales();
        adminView.prepararModalUsuario({
          municipios: store.estado.municipios || [],
          estados: store.estado.estados || []
        });
        adminView.limitarRolesAdmin(!sesion.esAdmin());
        abrirModal('modalUsuario', { nested: true });
      }),

    /** Edición: rellena el modal con la cuenta elegida en la tabla. */
    'admin:usuarioEditar': ({ id }) =>
      intentar(async () => {
        const usuario = (store.estado.usuarios || []).find((u) => u.id === id);
        if (!usuario) {
          toast('No se encontró esa cuenta, recarga el panel', 'err');
          return;
        }
        await cargarRolesEspeciales();
        adminView.prepararModalUsuario({
          usuario,
          municipios: store.estado.municipios || [],
          estados: store.estado.estados || []
        });
        adminView.limitarRolesAdmin(!sesion.esAdmin());
        abrirModal('modalUsuario', { nested: true });
      }),

    /** El rol decide si el municipio es obligatorio (funcionario) o no (admin). */
    'admin:usuarioRol': () => {
      adminView.actualizarNotaMunicipioUsuario();
      adminView.renderSelectRolEspecial();
      adminView.renderPermisos(null, document.getElementById('usuarioRol')?.value || 'funcionario');
    },

    /* ------------------------- roles especiales ------------------------- */
    'roles:abrir': () =>
      intentar(async () => {
        await cargarRolesEspeciales();
        adminView.renderListaRoles(rolesEspeciales);
        adminView.prepararFormRol(null);
        abrirModal('modalRolesEspeciales', { nested: true });
      }),
    'roles:nuevo': () => adminView.prepararFormRol(null),
    'roles:editar': ({ id }) =>
      adminView.prepararFormRol(adminView.rolPorId(id)),
    'roles:guardar': () =>
      intentar(async () => {
        const datos = adminView.valoresRolForm();
        if (!datos.nombre) return toast('Escribe un nombre para el rol', 'err');
        if (datos.id) await rolesService.actualizar(datos.id, datos);
        else await rolesService.crear(datos);
        await cargarRolesEspeciales();
        adminView.renderListaRoles(rolesEspeciales);
        adminView.prepararFormRol(null);
        toast(datos.id ? 'Rol actualizado' : 'Rol creado', 'ok');
      }),
    'roles:eliminar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Eliminar este rol especial? Las cuentas que lo tengan asignado lo perderán.'))) return;
        await rolesService.eliminar(id);
        await cargarRolesEspeciales();
        adminView.renderListaRoles(rolesEspeciales);
        toast('Rol eliminado', 'ok');
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
        if (!sesion.puede('gestionar_usuarios')) {
          toast('Tu cuenta no puede gestionar cuentas', 'err');
          return;
        }

        const datos = adminView.valoresUsuarioForm();
        if (!datos.id && !datos.username) return toast('Escribe el usuario de acceso', 'err');
        if (!datos.nombre) return toast('Escribe el nombre completo', 'err');
        if (
          !sesion.esAdmin() &&
          ['admin', 'admin_estatal', 'admin_municipal'].includes(datos.rol)
        ) {
          return toast('Solo el administrador maestro puede crear administradores', 'err');
        }
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
        if ((!datos.id || datos.password) && datos.password.length < 8) {
          return toast('La contraseña debe tener al menos 8 caracteres', 'err');
        }

        // En edición, la contraseña vacía significa «no la cambies».
        const envio = {
          nombre: datos.nombre,
          rol: datos.rol,
          municipios: datos.municipios,
          estados: datos.estados,
          puedeEscribir:
            ['funcionario', 'admin', 'admin_estatal', 'admin_municipal'].includes(datos.rol)
              ? datos.puedeEscribir
              : false,
          permisos: datos.permisos,
          correo: datos.correo,
          activo: datos.activo
        };
        if (datos.password) envio.password = datos.password;
        if (!datos.id) {
          envio.username = datos.username;
          envio.password = datos.password;
        }
        // Clave de acceso del personal (segundo factor del login).
        envio.generarClave = datos.generarClave === true;
        if (envio.generarClave) {
          envio.claveUsosMaximos = datos.claveUsosMaximos;
          envio.claveExpiraEn = datos.claveExpiraEn;
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

    'admin:usuariosTipo': ({ valor }) =>
      intentar(() => aplicacion.cargarUsuarios(valor === 'ciudadanos' ? 'ciudadanos' : 'personal')),

    'claves:abrir': () => {
      adminView.prepararModalClave(
        store.estado.municipios || [],
        store.estado.estados || []
      );
      abrirModal('modalClave', { nested: true });
    },

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
        const datos = adminView.valoresClaveForm();
        if (!datos.nombre) return toast('Escribe un nombre para la clave', 'err');
        if (!datos.municipios.length && !datos.estados.length) {
          return toast('Elige al menos un estado o un municipio', 'err');
        }
        await clavesService.crear(datos);
        cerrarModal('modalClave');
        await cargarClaves();
        toast('Clave generada', 'ok');
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

    'claves:eliminar': ({ id }) =>
      intentar(async () => {
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
        if (!sesion.puede('gestionar_claves')) {
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
      adminView.renderClaves(adminView.clavesCargadas(), store.estado.municipios || []),

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
