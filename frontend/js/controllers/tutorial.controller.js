/**
 * CONTROLADOR: tutorial guiado para quien entra por primera vez.
 *
 * Recorre los elementos de la interfaz con un foco y una tarjeta que los
 * explica. Los pasos se arman según el rol (el funcionario no cambia de
 * municipio, el personal tiene panel e informes) y se saltan solos los que
 * apunten a algo que no está en pantalla, así que la guía nunca señala al vacío.
 *
 * La bienvenida se muestra una sola vez por dispositivo (`localStorage`), igual
 * que la aceptación de términos, y se puede volver a ver con «¿Cómo funciona?».
 */
import { registrarAcciones } from '../core/eventos.js';
import { $, esc } from '../core/utils.js';
import { abrirModal, cerrarModal, toast } from '../core/ui.js';
import { sesion } from '../core/session.js';
import { store } from '../core/store.js';
import { esPersonal } from '../core/roles.js';
import { crearSelectorTerritorial } from '../core/selector-territorial.js';
import * as vista from '../views/tutorial.view.js';
import * as loginView from '../views/login.view.js';
import * as mapa from '../map/mapa.js';
import { GUIA_TUTORIALES, guiasPara } from '../data/tutoriales.js';
import { abrirTab } from './admin.controller.js';

const CLAVE = 'inc_tutorial_bienvenida_v1';
const CLAVE_ANTERIOR = 'inc_tutorial_v1';

/* ------------------------- simulación de tutoriales ---------------------- */

let demoInformeSelector = null;
let camposSimulados = [];
let modalesSimulados = new Set();
let capaOriginal = null;
let panelSimulado = false;
let loginSimulado = false;
let notifPanelSimulado = false;
let guiaActual = null;

/* Contexto que necesita cada paso: qué vista, pestaña o modal debe estar abierto. */
const CONTEXTO_POR_SIMULACION = {
  demoCuenta: { vista: 'login', modo: 'registro' },
  demoInforme: { modal: 'modalDemoInforme' },
  demoTicket: { modal: 'modalDemoTicket' },
  demoReportar: { modal: 'modalIncidencia' },
  demoReportarReabrir: { modal: 'modalIncidencia' },
  demoReportarMapa: { vista: 'app', mapa: true },
  demoComentar: { modal: 'modalDetalle' },
  demoFirmar: { modal: 'modalDetalle' },
  demoContacto: { modal: 'modalContacto' },
  demoFolios: { modal: 'modalFolios' },
  demoNotificaciones: { vista: 'app' },
  demoPublicidad: { vista: 'panel', tab: 'publicidad' },
  demoCampana: { vista: 'panel', tab: 'publicidad', modal: 'modalCampana' },
  demoUsuario: { vista: 'panel', tab: 'usuarios', modal: 'modalUsuario' },
  demoClave: { vista: 'panel', tab: 'claves', modal: 'modalClave' },
  demoTipo: { vista: 'panel', tab: 'tipos', modal: 'modalNuevoTipo' },
  demoFicha: { vista: 'panel', tab: 'municipios', modal: 'modalFichaMunicipio' },
  demoRegla: { vista: 'panel', tab: 'tickets' },
  demoStats: { vista: 'panel', tab: 'stats' },
  demoMapa: { vista: 'app' }
};

function contextoDePaso(paso, guia = guiaActual) {
  if (paso?.contexto) return paso.contexto;
  const porSimulacion = CONTEXTO_POR_SIMULACION[paso?.simulacion?.tipo];
  if (porSimulacion) {
    if (paso.simulacion.tipo === 'demoNotificaciones' && paso.simulacion.historial) {
      return { ...porSimulacion, modal: 'modalHistorialNotif' };
    }
    return porSimulacion;
  }
  if (guia?.vista === 'panel') return { vista: 'panel', tab: guia.tab || 'stats' };
  if (guia?.vista === 'monitoreo') return { vista: 'monitoreo' };
  if (guia?.vista === 'informes') return { vista: 'informes' };
  if (guia?.id?.startsWith('admin-')) {
    return { vista: 'panel', tab: guia.tab || TAB_POR_GUIA[guia.id] || 'stats' };
  }
  return { vista: 'app' };
}

function cerrarModalSimulado(id) {
  if (!id) return;
  cerrarModal(id);
  modalesSimulados.delete(id);
}

async function esperarModal(id, limite = 1600) {
  const modal = document.getElementById(id);
  const fin = Date.now() + limite;
  while (Date.now() < fin && !modal?.classList.contains('show')) {
    await new Promise((resolver) => setTimeout(resolver, 40));
  }
}

async function abrirPanelSiHaceFalta(tab) {
  const modal = document.getElementById('modalAdmin');
  if (!modal?.classList.contains('show')) {
    document.querySelector('#btn-admin')?.click();
    panelSimulado = true;
    modalesSimulados.add('modalAdmin');
    await esperarModal('modalAdmin', 2200);
  }
  if (!modal?.classList.contains('show')) return false;
  const cargando = document.getElementById('loading');
  for (let intento = 0; intento < 30 && cargando?.classList.contains('show'); intento++) {
    await new Promise((resolver) => setTimeout(resolver, 100));
  }
  if (typeof abrirTab === 'function') await abrirTab(tab || 'stats');
  document
    .querySelector(`#modalAdmin .admin-tab[data-valor="${tab || 'stats'}"]`)
    ?.classList.add('active');
  return true;
}

async function aplicarContextoPaso(paso, guia = guiaActual) {
  const contexto = contextoDePaso(paso, guia);

  // Cierra lo que pertenecía al paso anterior y no al actual.
  for (const id of [...modalesSimulados]) {
    if (id !== contexto.modal && id !== 'modalAdmin' && !(contexto.vista === 'panel' && id === 'modalAdmin')) {
      cerrarModalSimulado(id);
    }
  }
  if (loginSimulado && contexto.vista !== 'login') {
    loginView.cancelarLogin();
    loginSimulado = false;
  }
  if (panelSimulado && contexto.vista !== 'panel') {
    cerrarModal('modalAdmin');
    panelSimulado = false;
    modalesSimulados.delete('modalAdmin');
  }

  if (contexto.vista === 'login') {
    if (!loginView.estaVisible()) {
      loginView.mostrarLogin({ puedeCancelar: true, modo: contexto.modo || 'registro' });
      loginSimulado = true;
    } else if (contexto.modo) {
      loginView.mostrarModoAnon(contexto.modo);
    }
  } else if (contexto.vista === 'panel') {
    await abrirPanelSiHaceFalta(contexto.tab || guia?.tab || 'stats');
  } else if (contexto.vista === 'monitoreo') {
    if (!document.getElementById('modalMonitoreo')?.classList.contains('show')) {
      document.querySelector('[data-action="monitoreo:abrir"]')?.click();
      modalesSimulados.add('modalMonitoreo');
      await esperarModal('modalMonitoreo');
    }
  } else if (contexto.vista === 'informes') {
    if (!document.getElementById('modalReportes')?.classList.contains('show')) {
      document.querySelector('[data-action="reportes:abrir"]')?.click();
      modalesSimulados.add('modalReportes');
      await esperarModal('modalReportes');
    }
  } else if (contexto.mapa) {
    const modalIncidencia = document.getElementById('modalIncidencia');
    if (modalIncidencia?.classList.contains('show')) {
      cerrarModal('modalIncidencia');
      modalesSimulados.delete('modalIncidencia');
    }
  }

  if (contexto.modal && !document.getElementById(contexto.modal)?.classList.contains('show')) {
    abrirDemo(contexto.modal);
    await esperarModal(contexto.modal);
  }
}


function recordarCampo(elemento) {
  if (!elemento || camposSimulados.some((campo) => campo.elemento === elemento)) return;
  camposSimulados.push({
    elemento,
    valor: elemento.value,
    checked: elemento.checked === true
  });
}

function fijarCampo(selector, valor, { evento = 'change' } = {}) {
  const elemento = document.querySelector(selector);
  if (!elemento) return;
  recordarCampo(elemento);
  elemento.value = valor ?? '';
  if (evento) elemento.dispatchEvent(new Event(evento, { bubbles: true }));
}

function fijarCheck(selector, marcado) {
  const elemento = document.querySelector(selector);
  if (!elemento) return;
  recordarCampo(elemento);
  elemento.checked = marcado === true;
  elemento.dispatchEvent(new Event('change', { bubbles: true }));
}

function abrirDemo(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (!modal.classList.contains('show')) abrirModal(id, { nested: true });
  modalesSimulados.add(id);
}

function reiniciarDemoInforme() {
  const modal = document.getElementById('modalDemoInforme');
  if (!modal || modal.classList.contains('show')) return;
  document.getElementById('demoInformeNombre').value = '';
  document.getElementById('demoInformeCorreo').value = '';
  document.getElementById('demoInformeDesde').value = '';
  document.getElementById('demoInformeHasta').value = '';
  document.getElementById('demoInformeTipos').value = '';
  document.getElementById('demoInformeFormato').value = 'pdf';
  document.getElementById('demoInformeTerminos').checked = false;
  document.getElementById('demoInformeEstado').classList.add('u-oculto');
  demoInformeSelector?.limpiar();
}

function reiniciarDemoTicket() {
  const modal = document.getElementById('modalDemoTicket');
  if (!modal || modal.classList.contains('show')) return;
  document.getElementById('demoTicketAsunto').value = '';
  document.getElementById('demoTicketCuerpo').value = '';
  document.getElementById('demoTicketCategoria').value = 'error';
  document.getElementById('demoTicketEstado').classList.add('u-oculto');
}

function inicializarDemoInforme() {
  const contenedor = document.getElementById('demoInformeTerritorio');
  if (!contenedor || demoInformeSelector) return;
  demoInformeSelector = crearSelectorTerritorial({
    contenedor: 'demoInformeTerritorio',
    municipios: store.estado.municipios || [],
    modo: 'ambos'
  });
}

function marcarDemo(id, texto, tipo = 'ok') {
  const caja = document.getElementById(id);
  if (!caja) return;
  caja.className = `publico-msg ${tipo}`;
  caja.textContent = texto;
  caja.classList.remove('u-oculto');
}

async function simularPaso(paso) {
  const simulacion = paso?.simulacion;
  if (!simulacion?.tipo) return;

  switch (simulacion.tipo) {
    case 'demoInforme': {
      reiniciarDemoInforme();
      abrirDemo('modalDemoInforme');
      inicializarDemoInforme();
      if (simulacion.estadoFiltro) {
        const filtro = document.querySelector('#demoInformeTerritorio .terr-filtro-estado');
        const opcion = [...(filtro?.options || [])].find((o) => o.value);
        if (opcion) fijarCampo('#demoInformeTerritorio .terr-filtro-estado', opcion.value);
      }
      if (simulacion.seleccionarEstado) {
        document.querySelector('#demoInformeTerritorio .terr-grupo-todos')?.click();
      }
      for (const campo of simulacion.campos || []) {
        fijarCampo(campo.selector, campo.valor, { evento: campo.evento || 'change' });
      }
      if (simulacion.check) fijarCheck(simulacion.check.selector, simulacion.check.valor);
      break;
    }
    case 'demoTicket':
      reiniciarDemoTicket();
      abrirDemo('modalDemoTicket');
      for (const campo of simulacion.campos || []) {
        fijarCampo(campo.selector, campo.valor, { evento: campo.evento || 'change' });
      }
      break;
    case 'demoReportar': {
      if (!document.getElementById('modalIncidencia')?.classList.contains('show')) {
        document.querySelector('.fab.primary')?.click();
        modalesSimulados.add('modalIncidencia');
        await new Promise((resolver) => setTimeout(resolver, 100));
      }
      fijarCampo('#incTitulo', 'Bache de ejemplo', { evento: 'input' });
      fijarCampo('#incDescripcion', 'Reporte de demostración: no se enviará.', { evento: 'input' });
      break;
    }
    case 'demoReportarMapa':
      document.querySelector('[data-action="incidencias:elegirMapa"]')?.click();
      break;
    case 'demoReportarReabrir':
      mapa.cancelarModoElegir();
      document.querySelector('.fab.primary')?.click();
      modalesSimulados.add('modalIncidencia');
      await new Promise((resolver) => setTimeout(resolver, 120));
      fijarCampo('#incTitulo', 'Bache de ejemplo', { evento: 'input' });
      fijarCampo('#incDescripcion', 'Reporte de demostración: no se enviará.', { evento: 'input' });
      break;
    case 'demoCerrarDetalle':
      cerrarModal('modalDetalle');
      modalesSimulados.delete('modalDetalle');
      break;
    case 'navegar': {
      const objetivo = document.querySelector(paso.objetivo);
      if (!objetivo) break;
      if (objetivo.matches('a[href]')) {
        window.open(objetivo.href, '_blank', 'noopener');
      } else {
        objetivo.click();
        if (paso.objetivo === '#btn-admin') {
          modalesSimulados.add('modalAdmin');
          panelSimulado = true;
        }
      }
      break;
    }
    case 'demoRegla': {
      const municipio = document.querySelector('#reglaMunicipio option:not([value=""])')?.value;
      if (municipio) fijarCampo('#reglaMunicipio', municipio);
      fijarCampo('#reglaPrioridad', simulacion.prioridad || 'alta');
      fijarCampo('#reglaRol', simulacion.rol || 'soporte');
      document.querySelector('[data-action="reglas:simular"]')?.click();
      break;
    }
    case 'demoPublicidad':
      fijarCampo('#publicidadTitulo', 'Reporta los problemas de tu municipio', { evento: 'input' });
      fijarCampo('#publicidadTexto', 'Una demo del editor: el texto se compone con la plantilla y el enlace del sistema.', { evento: 'input' });
      fijarCampo('#publicidadCta', 'Reporta aquí', { evento: 'input' });
      fijarCampo('#publicidadHashtags', '#Demo #MiMunicipio', { evento: 'input' });
      document.querySelector('[data-action="publicidad:simular"]')?.click();
      break;
    case 'demoCampana':
      document.querySelector('[data-action="campanas:nueva"]')?.click();
      modalesSimulados.add('modalCampana');
      fijarCampo('#campNombre', 'Campaña de ejemplo', { evento: 'input' });
      fijarCampo('#campAsunto', 'Conoce el sistema de incidencias', { evento: 'input' });
      fijarCampo('#campHtml', '<p>Hola, ya puedes reportar incidencias en línea.</p>', {
        evento: 'input'
      });
      break;
    case 'demoUsuario':
      document.querySelector('[data-action="admin:usuarioNuevo"]')?.click();
      modalesSimulados.add('modalUsuario');
      fijarCampo('#usuarioUsername', 'demo.soporte', { evento: 'input' });
      fijarCampo('#usuarioNombre', 'Cuenta de ejemplo', { evento: 'input' });
      break;
    case 'demoClave':
      document.querySelector('[data-action="claves:abrir"]')?.click();
      modalesSimulados.add('modalClave');
      fijarCampo('#claveNombre', 'Clave de ejemplo', { evento: 'input' });
      break;
    case 'demoTipo':
      document.querySelector('[data-action="tipos:abrir"]')?.click();
      modalesSimulados.add('modalNuevoTipo');
      fijarCampo('#nuevoTipoNombre', 'Semáforo descompuesto', { evento: 'input' });
      break;
    case 'demoFicha':
      document.querySelector('[data-action="municipios:ficha"]')?.click();
      modalesSimulados.add('modalFichaMunicipio');
      break;
    case 'demoContacto':
      document.querySelector('[data-action="contacto:abrir"]')?.click();
      modalesSimulados.add('modalContacto');
      await new Promise((resolver) => setTimeout(resolver, 80));
      {
        const estado = document.querySelector('#conEstado option:not([value=""])')?.value;
        if (estado) fijarCampo('#conEstado', estado);
        await new Promise((resolver) => setTimeout(resolver, 80));
        const municipio = document.querySelector('#conMunicipio option:not([value=""])')?.value;
        if (municipio) fijarCampo('#conMunicipio', municipio);
      }
      break;
    case 'demoFolios':
      document.querySelector('[data-action="folios:abrir"]')?.click();
      modalesSimulados.add('modalFolios');
      fijarCampo('#foliosTexto', 'INF-', { evento: 'input' });
      break;
    case 'demoNotificaciones': {
      const panel = document.getElementById('notifPanel');
      if (!panel?.classList.contains('show')) {
        document.querySelector('[data-action="notificaciones:toggle"]')?.click();
        notifPanelSimulado = true;
      }
      if (simulacion.historial) {
        await new Promise((resolver) => setTimeout(resolver, 80));
        document.querySelector('[data-action="notificaciones:historial"]')?.click();
        modalesSimulados.add('modalHistorialNotif');
      }
      break;
    }
    case 'demoMapa':
      if (!capaOriginal) capaOriginal = mapa.capaBaseActual();
      mapa.cambiarCapaBase(simulacion.capa || 'hibrido');
      break;
    case 'demoCuenta':
      loginView.mostrarLogin({ puedeCancelar: true, modo: 'registro' });
      loginSimulado = true;
      fijarCampo('#reg-nombre', 'Vecina Ejemplo', { evento: 'input' });
      fijarCampo('#reg-correo', 'demo@ejemplo.mx', { evento: 'input' });
      break;
    case 'demoStats':
      document.querySelector('[data-action="stats:aplicar"]')?.click();
      break;
    case 'demoComentar':
    case 'demoFirmar':
      document.querySelector('#listaIncidencias .incidencia-card')?.click();
      modalesSimulados.add('modalDetalle');
      break;
    default:
      break;
  }
}

function restaurarSimulacion() {
  for (const { elemento, valor, checked } of camposSimulados.reverse()) {
    if (!elemento?.isConnected) continue;
    elemento.value = valor;
    if (elemento.type === 'checkbox') elemento.checked = checked;
  }
  camposSimulados = [];
  for (const id of modalesSimulados) cerrarModal(id);
  modalesSimulados = new Set();
  mapa.cancelarModoElegir();
  if (panelSimulado) {
    cerrarModal('modalAdmin');
    panelSimulado = false;
  }
  if (loginSimulado) {
    loginView.cancelarLogin();
    loginSimulado = false;
  }
  if (notifPanelSimulado) {
    document.getElementById('notifPanel')?.classList.remove('show');
    notifPanelSimulado = false;
  }
  if (capaOriginal) {
    mapa.cambiarCapaBase(capaOriginal);
    capaOriginal = null;
  }
  demoInformeSelector?.limpiar();
}

function pasoDisponible(paso, rol) {
  if (!paso) return false;
  if (paso.soloAnonimo && rol !== 'anonimo') return false;
  if (Array.isArray(paso.soloRoles) && !paso.soloRoles.includes(rol)) return false;
  if (paso.permiso && !sesion.puede(paso.permiso)) return false;
  if (paso.simulacion?.soloAdmin && !sesion.esAdmin()) return false;
  return Boolean(paso.simulacion || !paso.objetivo || document.querySelector(paso.objetivo));
}

/** Pasos de la guía, en orden. */
function pasosDe(usuario, guiaId = null) {
  const rol = usuario?.rol || 'anonimo';
  if (guiaId) {
    const guia = GUIA_TUTORIALES.find((g) => g.id === guiaId && g.roles.includes(rol));
    if (!guia) return [];
    if (guia.permiso && !sesion.puede(guia.permiso)) return [];
    return guia.pasos.filter((paso) => pasoDisponible(paso, rol));
  }
  const esEmpleado = esPersonal(usuario);
  // El selector municipal está bloqueado para todo el personal salvo el admin
  // maestro; el tutorial no debe señalar un control que no se puede usar.
  const cambiaDeMunicipio = !esEmpleado || rol === 'admin';

  const pasos = [
    {
      centrado: true,
      titulo: '¡Bienvenido!',
      texto:
        'En menos de un minuto te enseño lo que puedes hacer aquí. Puedes salir con «Saltar» y volver a verlo cuando quieras.'
    }
  ];

  if (cambiaDeMunicipio) {
    pasos.push(
      {
        objetivo: '#municipioBuscar',
        colocacion: 'abajo',
        titulo: 'Tu municipio',
        texto:
          'Escribe aquí para buscar y cambiar de municipio. Verás los reportes del que tengas activo.'
      },
      {
        objetivo: '#colindantesBox',
        colocacion: 'derecha',
        titulo: 'Municipios vecinos',
        texto:
          'Estos botones te llevan a los municipios que colindan con el activo, para seguir los problemas de la zona.'
      }
    );
  }

  pasos.push(
    {
      objetivo: '.filters',
      colocacion: 'derecha',
      titulo: 'Filtros',
      texto:
        'Busca por texto y filtra por estado, tipo, color (antigüedad) o comunidad para encontrar lo que te interesa.'
    },
    {
      objetivo: '#listaIncidencias',
      colocacion: 'derecha',
      titulo: 'Los reportes del municipio',
      texto:
        'Aquí aparece todo lo que ha reportado la gente. Toca cualquier tarjeta para ver el detalle, los comentarios y el seguimiento.'
    },
    {
      objetivo: '#map',
      colocacion: 'dentro-abajo',
      titulo: 'El mapa',
      texto:
        'Cada punto es un reporte y su color dice la antigüedad: amarillo menos de 15 días, naranja de 15 a 30 y rojo más de 30; verde si ya se resolvió. Arriba a la derecha cambias de capa (satélite, calles, relieve).'
    },
    {
      objetivo: '.fab.primary',
      colocacion: 'izquierda',
      titulo: 'Reportar es el botón +',
      texto:
        'Elige el tipo, describe el problema, marca la ubicación en el mapa y adjunta fotografías. Antes de enviar decides si firmas con tu nombre o lo publicas como anónimo.'
    },
    {
      objetivo: '[data-action="notificaciones:toggle"]',
      colocacion: 'abajo',
      titulo: 'Tus avisos',
      texto: esEmpleado
        ? 'En la campana llegan los avisos del municipio: reportes críticos por antigüedad y tu actividad.'
        : 'En la campana verás si tu reporte cambió de estado, si lo resolvieron o si alguien lo comentó.'
    }
  );

  if (rol !== 'anonimo') {
    pasos.push(
      {
        objetivo: '#listaIncidencias',
        colocacion: 'derecha',
        titulo: 'Firmas y comentarios',
        texto:
          'Abre cualquier reporte para comentar, firmar y ver los firmantes. Una cuenta puede firmar una vez por incidencia y hasta el límite configurado.'
      },
      {
        objetivo: '[data-action="contacto:abrir"]',
        colocacion: 'derecha',
        titulo: 'Contacta a un funcionario',
        texto:
          'Elige estado, municipio y uno o varios funcionarios. Si el municipio no tiene personal, puedes avisar al admin o crear una recolección de firmas.'
      },
      {
        objetivo: '[data-action="folios:abrir"]',
        colocacion: 'derecha',
        titulo: 'Tus folios',
        texto:
          'El buscador de folios reúne tus incidencias, tickets, informes, contactos y firmas para que no pierdas ningún trámite.'
      }
    );
  }

  if (esEmpleado) {
    pasos.push(
      {
        objetivo: '#btn-admin',
        colocacion: 'abajo',
        titulo: 'Panel de administración',
        texto:
          'Desde el panel gestionas incidencias, usuarios, tickets, moderación, firmas, legal, configuración y respaldos. Solo verás las pestañas de tu rol.'
      },
      {
        objetivo: '#btn-informes',
        colocacion: 'abajo',
        titulo: 'Informes',
        texto:
          'Informes reúne las estadísticas y la exportación: informe imprimible y respaldo en JSON.'
      }
    );
  } else {
    pasos.push({
      objetivo: '#notaCuenta',
      colocacion: 'derecha',
      titulo: rol === 'ciudadano' ? 'Tu cuenta' : 'Crea tu cuenta',
      texto:
        rol === 'ciudadano'
          ? 'Con tu cuenta recibes los avisos de tus reportes y puedes editarlos. Sigues pudiendo publicar sin mostrar tu nombre.'
          : 'Como anónimo puedes reportar, pero no recibes avisos. Crea una cuenta (correo y contraseña) y sabrás si tu reporte se atendió, aunque lo firmes como anónimo.'
    });
  }

  pasos.push({
    centrado: true,
    titulo: '¡Listo!',
    texto:
      'Ya sabes lo básico. Puedes repetir esta guía cuando quieras con «¿Cómo funciona?» en el panel lateral.'
  });

  // Si un paso apunta a algo que no está en pantalla (por ejemplo, un municipio
  // sin vecinos), se salta: la guía nunca señala al vacío. Los pasos con
  // simulación se conservan aunque su objetivo se cree al ejecutarla.
  return pasos.filter((paso) => pasoDisponible(paso, rol));
}

let pasos = [];
let indice = 0;

/** ¿Ya se mostró la bienvenida en este dispositivo? */
export function visto() {
  try {
    if (JSON.parse(localStorage.getItem(CLAVE) || 'null')?.visto === true) return true;
    // Las versiones anteriores guardaban una marca por versión. Se migra para
    // no volver a mostrar la bienvenida a quien ya la cerró.
    if (JSON.parse(localStorage.getItem(CLAVE_ANTERIOR) || 'null')?.fecha) {
      marcarVisto();
      return true;
    }
  } catch {
    // localStorage no disponible: se trata como no visto.
  }
  return false;
}

function marcarVisto() {
  localStorage.setItem(CLAVE, JSON.stringify({ visto: true, fecha: new Date().toISOString() }));
}

/** La barra lateral puede estar recogida: se despliega si el paso apunta dentro. */
function asegurarObjetivoVisible(selector) {
  if (!selector) return;
  const enSidebar = document.querySelector(selector)?.closest('#sidebar');
  if (enSidebar && $('sidebar')?.classList.contains('collapsed')) {
    loginView.alternarSidebar();
    mapa.invalidarTamano();
  }
}

/** Espera a que el objetivo exista, tenga tamaño y sea visible (modales animados). */
async function esperarObjetivoVisible(selector) {
  if (!selector) return;
  const limite = Date.now() + 900;
  while (Date.now() < limite) {
    const elemento = document.querySelector(selector);
    if (elemento) {
      const rect = elemento.getBoundingClientRect();
      const estilo = getComputedStyle(elemento);
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        estilo.display !== 'none' &&
        estilo.visibility !== 'hidden' &&
        Number(estilo.opacity) > 0
      ) {
        return;
      }
    }
    await new Promise((resolver) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolver);
      else setTimeout(resolver, 30);
    });
  }
}

async function pintar() {
  const paso = pasos[indice];
  await aplicarContextoPaso(paso, guiaActual);
  asegurarObjetivoVisible(paso.foco || paso.objetivo);
  await simularPaso(paso);
  await esperarObjetivoVisible(paso.foco || paso.objetivo);
  // Deja que el modal o la vista recién abierta termine de pintar antes de
  // medir el objetivo; sin esto el foco podía quedar en 0×0.
  await new Promise((resolver) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(resolver));
    } else {
      setTimeout(resolver, 40);
    }
  });
  vista.renderizar({ paso, indice, total: pasos.length });
}

/** Abre la guía general desde el principio. */
export function abrir() {
  if (!$('app')?.classList.contains('active')) return false;
  if ($('onboarding') && !$('onboarding').hidden) return false;
  if (loginView.estaVisible()) return false;
  if (document.querySelector('.modal-overlay.show')) return false;

  guiaActual = null;
  restaurarSimulacion();
  pasos = pasosDe(sesion.usuario);
  if (pasos.length < 2) return false;

  indice = 0;
  pintar().catch((error) => console.error('[tutorial] simulación:', error));
  return true;
}

/** Abre una guía concreta de la enciclopedia. */
const TAB_POR_GUIA = {
  'admin-general': 'stats',
  'admin-firmas': 'firmas',
  'admin-legal': 'legal',
  'admin-informes': 'solicitudes-informe',
  'admin-respaldos': 'respaldos',
  'admin-configuracion': 'configuracion',
  'admin-moderacion': 'moderacion',
  'admin-campanas': 'publicidad',
  'admin-simulador': 'simulador',
  'admin-publicidad': 'publicidad',
  'admin-correos': 'correos'
};

/** Abre la vista que necesita una guía antes de buscar sus objetivos. */
async function prepararVista(guia) {
  if (!guia) return;
  if (guia.id?.startsWith('admin-') && !guia.vista) {
    guia = { ...guia, vista: 'panel', tab: TAB_POR_GUIA[guia.id] || 'stats' };
  }
  if (guia.vista === 'panel') {
    const modal = $('modalAdmin');
    if (!modal?.classList.contains('show')) {
      document.querySelector('#btn-admin')?.click();
      panelSimulado = true;
      modalesSimulados.add('modalAdmin');
      for (let intento = 0; intento < 20 && !modal?.classList.contains('show'); intento++) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const cargando = document.getElementById('loading');
    for (let intento = 0; intento < 30 && cargando?.classList.contains('show'); intento++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const tab = guia.tab || 'stats';
    if (typeof abrirTab === 'function') {
      await abrirTab(tab);
      document.querySelector(`#modalAdmin .admin-tab[data-valor="${tab}"]`)?.classList.add('active');
    }
    return;
  }
  if (guia.vista === 'monitoreo') {
    document.querySelector('[data-action="monitoreo:abrir"]')?.click();
    modalesSimulados.add('modalMonitoreo');
    await new Promise((r) => setTimeout(r, 350));
    return;
  }
  if (guia.vista === 'informes') {
    document.querySelector('[data-action="reportes:abrir"]')?.click();
    modalesSimulados.add('modalReportes');
    await new Promise((r) => setTimeout(r, 350));
  }
}

export async function abrirGuia(guiaId) {
  if (!$('app')?.classList.contains('active')) return false;
  const guia = GUIA_TUTORIALES.find((g) => g.id === guiaId && g.roles.includes(sesion.usuario?.rol || 'anonimo'));
  if (!guia) return false;
  if (guia.permiso && !sesion.puede(guia.permiso)) {
    toast('Esta guía requiere un permiso que tu cuenta no tiene', 'err');
    return false;
  }
  restaurarSimulacion();
  guiaActual = guia;
  try {
    await prepararVista(guia);
  } catch (error) {
    console.error('[tutorial] vista:', error);
    toast('No se pudo abrir la vista de esta guía', 'err');
    return false;
  }
  const lista = pasosDe(sesion.usuario, guiaId);
  if (!lista.length) {
    toast('Esta guía no tiene pasos disponibles para tu cuenta', 'err');
    return false;
  }
  cerrarModal('modalTutoriales');
  pasos = lista;
  indice = 0;
  pintar().catch((error) => console.error('[tutorial] simulación:', error));
  return true;
}

/** Abre la enciclopedia filtrada por rol y búsqueda. */
export function abrirEnciclopedia() {
  const texto = vista.leerBusquedaEnciclopedia().toLowerCase();
  const guias = guiasPara(sesion.usuario).filter(
    (guia) =>
      !texto ||
      `${guia.titulo} ${guia.descripcion} ${guia.categoria}`.toLowerCase().includes(texto)
  );
  vista.renderEnciclopedia(guias);
  abrirModal('modalTutoriales');
}

/** Se muestra sola una vez por dispositivo; después vive en la enciclopedia. */
export function quizáMostrar() {
  if (visto()) return false;
  const mostrado = abrir();
  if (mostrado) marcarVisto();
  return mostrado;
}

function cerrar() {
  marcarVisto();
  restaurarSimulacion();
  vista.ocultar();
}

function siguiente() {
  if (indice >= pasos.length - 1) {
    cerrar();
    return;
  }
  indice++;
  pintar().catch((error) => console.error('[tutorial] simulación:', error));
}

function anterior() {
  if (indice === 0) return;
  indice--;
  pintar().catch((error) => console.error('[tutorial] simulación:', error));
}

export function registrar() {
  registrarAcciones({
    'tutorial:abrir': () => abrir(),
    'tutorial:siguiente': () => siguiente(),
    'tutorial:anterior': () => anterior(),
    'tutorial:saltar': () => cerrar(),
    'tutorial:enciclopedia': () => abrirEnciclopedia(),
    'tutorial:buscar': () => abrirEnciclopedia(),
    'tutorial:guia': ({ valor }) => {
      abrirGuia(valor).catch((error) => {
        console.error('[tutorial] guía:', error);
        toast('No se pudo abrir la guía', 'err');
      });
    },
    'tutorial:demoInforme:fin': () => {
      marcarDemo(
        'demoInformeEstado',
        'Simulación completada: no se envió nada. El folio ficticio sería INF-DEMO-000001.'
      );
    },
    'tutorial:demoTicket:fin': () => {
      marcarDemo(
        'demoTicketEstado',
        'Simulación completada: no se creó ningún ticket. El folio ficticio sería TCK-DEMO-000001.'
      );
    },
    'tutorial:demoCerrar': ({ valor }) => {
      modalesSimulados.delete(valor);
      cerrarModal(valor);
    },
    'tutorial:cerrarEnciclopedia': () => cerrarModal('modalTutoriales')
  });

  // Teclado: flechas para moverse, Escape para salir.
  document.addEventListener('keydown', (evento) => {
    if (!vista.visible()) return;
    if (evento.key === 'ArrowRight' || evento.key === 'Enter') {
      evento.preventDefault();
      siguiente();
    } else if (evento.key === 'ArrowLeft') {
      evento.preventDefault();
      anterior();
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      cerrar();
    }
  });

  // Al cambiar el tamaño (o girar el móvil) el foco se vuelve a colocar.
  window.addEventListener('resize', () => vista.recolocar());
}
