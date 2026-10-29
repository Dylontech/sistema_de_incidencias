/**
 * Punto de entrada del frontend.
 *
 * Une todas las piezas: conecta la delegación de eventos, registra las
 * acciones de cada controlador, restaura la sesión si existe y arranca la
 * aplicación (o muestra el login).
 */
import { conectarDelegacion } from './core/eventos.js';
import { inicializarModales, loading, retirarArranque, toast } from './core/ui.js';
import { sesion } from './core/session.js';
import { consentimiento } from './core/consentimiento.js';
import * as accesibilidad from './core/accesibilidad.js';
import * as tiempoReal from './core/tiempo-real.js';
import * as offline from './core/offline.js';
import { authService } from './services/auth.service.js';
import { publicidadService } from './services/publicidad.service.js';
import * as aplicacion from './core/aplicacion.js';
import * as mapa from './map/mapa.js';
import {
  conectarCierreDePaneles,
  entrarComoCiudadano,
  registrar as registrarAuth
} from './controllers/auth.controller.js';
import { mostrarLogin } from './views/login.view.js';
import { registrar as registrarIncidencias } from './controllers/incidencias.controller.js';
import { registrar as registrarTipos } from './controllers/tipos.controller.js';
import { registrar as registrarAdmin } from './controllers/admin.controller.js';
import { registrar as registrarReportes } from './controllers/reportes.controller.js';
import { registrar as registrarNotificaciones } from './controllers/notificaciones.controller.js';
import { registrar as registrarModeracion } from './controllers/moderacion.controller.js';
import { registrar as registrarMonitoreo } from './controllers/monitoreo.controller.js';
import { registrar as registrarServidor } from './controllers/servidor.controller.js';
import { registrar as registrarCampanas } from './controllers/campanas.controller.js';
import { registrar as registrarConfiguracion } from './controllers/configuracion.controller.js';
import { registrar as registrarLegal } from './controllers/legal.controller.js';
import { registrar as registrarFirmasAdmin } from './controllers/firmasAdmin.controller.js';
import { registrar as registrarSolicitudesInforme } from './controllers/solicitudesInforme.controller.js';
import {
  abrir as abrirSolicitudInforme,
  registrar as registrarSolicitudInformePublica
} from './controllers/solicitudInformePublica.controller.js';
import {
  abrirCon as abrirTickets,
  registrar as registrarTicketsModal
} from './controllers/ticketsModal.controller.js';
import { registrar as registrarRespaldos } from './controllers/respaldos.controller.js';
import { registrar as registrarSimulador } from './controllers/simulador.controller.js';
import { registrar as registrarPublicidad } from './controllers/publicidad.controller.js';
import { registrar as registrarQr } from './controllers/qr.controller.js';
import { registrar as registrarCorreosInstitucionales } from './controllers/correosInstitucionales.controller.js';
import { registrar as registrarFolios } from './controllers/folios.controller.js';
import { registrar as registrarPerfil } from './controllers/perfil.controller.js';
import {
  registrar as registrarComunicacion,
  actualizarBadge as actualizarBadgeMensajes
} from './controllers/comunicacion.controller.js';
import * as bloqueoView from './views/bloqueo.view.js';
import {
  registrar as registrarOnboarding,
  pedir as pedirConsentimiento
} from './controllers/onboarding.controller.js';
import { registrar as registrarAvisoLegal } from './controllers/avisoLegal.controller.js';
import {
  registrar as registrarTutorial,
  quizáMostrar as mostrarTutorial
} from './controllers/tutorial.controller.js';

function registrarControladores() {
  registrarAuth();
  registrarIncidencias();
  registrarTipos();
  registrarAdmin();
  registrarReportes();
  registrarNotificaciones();
  registrarModeracion();
  registrarMonitoreo();
  registrarServidor();
  registrarCampanas();
  registrarConfiguracion();
  registrarLegal();
  registrarFirmasAdmin();
  registrarSolicitudesInforme();
  registrarSolicitudInformePublica();
  registrarTicketsModal();
  registrarRespaldos();
  registrarSimulador();
  registrarPublicidad();
  registrarQr();
  registrarCorreosInstitucionales();
  registrarFolios();
  registrarPerfil();
  registrarComunicacion();
  registrarOnboarding();
  registrarAvisoLegal();
  registrarTutorial();
}

/** Devuelve las coordenadas si el navegador y la persona lo permiten. */
function ubicacionParaQr() {
  return new Promise((resolver) => {
    if (!navigator.geolocation || !window.isSecureContext) return resolver(null);
    navigator.geolocation.getCurrentPosition(
      (posicion) =>
        resolver({
          lat: posicion.coords.latitude,
          lng: posicion.coords.longitude,
          precision: posicion.coords.accuracy
        }),
      () => resolver(null),
      { enableHighAccuracy: true, timeout: 3500, maximumAge: 300000 }
    );
  });
}

/**
 * Entrada con QR: obtiene el municipio de la publicación o de la ubicación
 * actual y registra el escaneo una sola vez por pestaña. Nunca bloquea el
 * arranque si el enlace, la red o el permiso de ubicación fallan.
 */
async function resolverEntradaQr() {
  const codigo = new URLSearchParams(location.search).get('qr');
  if (!codigo) return null;
  const clave = `inc_qr_entrada_${codigo}`;
  try {
    const guardado = JSON.parse(sessionStorage.getItem(clave) || 'null');
    if (guardado) return guardado;
  } catch {
    /* sessionStorage no disponible */
  }
  try {
    const info = await publicidadService.qrInfo(codigo);
    const ubicacion = await ubicacionParaQr();
    const resultado = await publicidadService.escanearQr(codigo, ubicacion || {});
    const municipioId = resultado?.municipio?.id || info?.publicacion?.municipioId || null;
    const entrada = { codigo, municipioId };
    try {
      sessionStorage.setItem(clave, JSON.stringify(entrada));
    } catch {
      /* sessionStorage no disponible */
    }
    return entrada;
  } catch (error) {
    console.warn('[QR] No se pudo resolver la entrada:', error?.message || error);
    return null;
  }
}

/**
 * Paso previo de entrada: municipio en el que se va a reportar y aceptación de
 * los términos. Devuelve `null` cuando no hay nada que preguntar.
 */
function pasoPrevio({ usuario, municipioActivo, municipioSugerido = null }) {
  // El paso previo puede esperar a que la persona elija municipio y acepte
  // términos: el splash no debe quedar encima bloqueando esa interacción.
  retirarArranque();
  return pedirConsentimiento({ usuario, municipioActivo, municipioSugerido });
}

/**
 * Arranque de la sesión.
 *
 * Como en la versión nueva del monolito, el público NO pasa por la pantalla de
 * acceso: si no hay sesión guardada se entra directamente como ciudadano
 * anónimo. Esa pantalla solo ofrece el acceso ciudadano; el del personal vive
 * en `/personal` (ver `js/personal.js`), una página sin enlaces.
 */
async function iniciarSesion() {
  const guardada = sesion.cargar();
  const entradaQr = await resolverEntradaQr();
  const municipioSugerido = entradaQr?.municipioId || null;

  if (!guardada) {
    await entrarComoCiudadano({
      silencioso: true,
      antesDeArrancar: (datos) => pasoPrevio({ ...datos, municipioSugerido })
    });
    return;
  }

  loading(true, 'Restaurando sesión…');
  try {
    const { usuario, municipioActivo } = await authService.yo();
    // `/auth/me` no devuelve exactamente el mismo objeto que el login, pero sí
    // las capacidades efectivas; se guardan para que una recarga no degrade
    // roles como soporte o los administradores territoriales.
    sesion.actualizarUsuario(usuario);
    // El municipio elegido en la barra superior se conserva entre recargas
    // (si sigue existiendo: `arrancar` lo valida). El personal territorial usa
    // el que devuelve el servidor, que ya está dentro de su ámbito.
    const territorial =
      usuario.rol !== 'ciudadano' && usuario.rol !== 'anonimo' && usuario.rol !== 'admin';
    const elegido = territorial ? municipioActivo : guardada.municipioActivo;
    // Paso previo: municipio (sin preselección) + términos, si quedan pendientes.
    const previo = await pasoPrevio({
      usuario,
      municipioActivo: elegido || municipioActivo,
      municipioSugerido
    });
    await aplicacion.arrancar({
      usuario,
      municipioActivo: previo?.municipio || elegido || municipioActivo
    });
    actualizarBadgeMensajes().catch(() => {});
  } catch (error) {
    // Cuenta suspendida por moderación: no se entra (ni siquiera como anónimo).
    if (error?.estado === 403) {
      sesion.limpiar();
      bloqueoView.mostrar(error.message);
      return;
    }
    // Token caducado o servidor no disponible: se entra como ciudadano en
    // lugar de dejar la pantalla bloqueada.
    sesion.limpiar();
    await entrarComoCiudadano({
      silencioso: true,
      antesDeArrancar: (datos) => pasoPrevio({ ...datos, municipioSugerido })
    });
    if (error.estado && error.estado !== 401) {
      toast(error.message || 'No se pudo restaurar la sesión', 'err');
    }
  } finally {
    retirarArranque();
    loading(false);
  }
}

/**
 * Abre el destino indicado en la URL: una incidencia, un ticket, un contacto
 * directo, la bandeja de mensajes o una pestaña del panel de administración.
 * Se usa en los enlaces profundos de las notificaciones.
 */
async function abrirDestinoInicial() {
  const params = new URLSearchParams(location.search);
  if ((params.get('login') || params.get('registro')) && (!sesion.rol || sesion.rol === 'anonimo')) {
    setTimeout(
      () =>
        mostrarLogin({
          puedeCancelar: true,
          modo: params.get('registro') ? 'registro' : 'login'
        }),
      500
    );
    return;
  }
  const incidencia = params.get('incidencia');
  if (incidencia) {
    const { abrirDesdePanel } = await import('./controllers/incidencias.controller.js');
    abrirDesdePanel(incidencia);
    return;
  }
  const verificarInforme = params.get('verificar');
  if (verificarInforme) {
    setTimeout(() => abrirSolicitudInforme({ verificar: verificarInforme }), 500);
    return;
  }
  if (params.get('informe')) {
    setTimeout(() => abrirSolicitudInforme({ folio: params.get('folio') }), 500);
    return;
  }
  if (params.get('tickets')) {
    setTimeout(() => abrirTickets(), 500);
    return;
  }
  const ticket = params.get('ticket');
  if (ticket) {
    const atiende = sesion.usuario?.puedeAtenderTickets === true || sesion.rol === 'admin';
    if (atiende) {
      location.assign(`/soporte?ticket=${encodeURIComponent(ticket)}`);
    } else {
      setTimeout(() => abrirTickets(ticket), 500);
    }
    return;
  }
  const contactoDirecto = params.get('contacto');
  if (contactoDirecto) {
    setTimeout(async () => {
      const { abrirContactoDirectoPanel } = await import('./controllers/comunicacion.controller.js');
      await abrirContactoDirectoPanel(contactoDirecto);
    }, 500);
    return;
  }
  const bandeja = params.get('bandeja');
  if (bandeja) {
    setTimeout(() => {
      document.querySelector('[data-action="bandeja:abrir"]')?.click();
      setTimeout(
        () => document.querySelector(`[data-action="bandeja:tab"][data-valor="${bandeja}"]`)?.click(),
        250
      );
      const hilo = params.get('hilo');
      if (hilo) {
        setTimeout(
          () => document.querySelector(`[data-action="bandeja:hilo"][data-valor="${hilo}"]`)?.click(),
          450
        );
      }
    }, 500);
    return;
  }
  const admin = params.get('admin');
  if (admin) {
    setTimeout(() => {
      document.getElementById('btn-admin')?.click();
      setTimeout(
        () => document.querySelector(`[data-action="admin:tab"][data-valor="${admin}"]`)?.click(),
        300
      );
    }, 500);
  }
}

let revisandoTerminos = false;
async function revisarTerminos() {
  if (revisandoTerminos || !sesion.usuario) return;
  if (!document.getElementById('app')?.classList.contains('active')) return;
  if (document.getElementById('onboarding')?.hidden === false) return;
  revisandoTerminos = true;
  try {
    await consentimiento.cargarEstado();
    if (!consentimiento.vigente()) {
      await pedirConsentimiento({ usuario: sesion.usuario, soloTerminos: true });
    }
  } finally {
    revisandoTerminos = false;
  }
}

async function iniciar() {
  accesibilidad.inicializar();
  registrarControladores();
  conectarDelegacion();
  conectarCierreDePaneles();
  inicializarModales({
    // Mientras se elige una ubicación en el mapa, el fondo del modal no lo cierra.
    alIntentarCerrar: (id) => !(id === 'modalIncidencia' && mapa.modoElegirActivo())
  });

  // El token caducó en mitad de la sesión: se avisa y se recarga.
  document.addEventListener('sesion-expirada', () => {
    tiempoReal.detener();
    toast('Tu sesión expiró, vuelve a iniciar sesión', 'err');
    sesion.limpiar();
    setTimeout(() => location.reload(), 1200);
  });

  // La cuenta fue suspendida por moderación mientras la sesión estaba abierta:
  // se cubre la interfaz con el aviso (el token se queda hasta cerrar sesión).
  document.addEventListener('cuenta-suspendida', (evento) => {
    bloqueoView.mostrar(evento.detail?.mensaje);
  });

  // El servidor rechazó una escritura porque cambió la versión legal.
  document.addEventListener('terminos-pendientes', () => {
    revisarTerminos().catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) revisarTerminos().catch(() => {});
  });
  window.addEventListener('focus', () => revisarTerminos().catch(() => {}));

  await iniciarSesion();
  await abrirDestinoInicial().catch(() => {});

  // Cola offline y caché del armazón (solo en producción).
  offline.iniciar();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Las sesiones anónimas no tienen buzón: no se abre el canal para ellas.
  if (sesion.rol && sesion.rol !== 'anonimo') tiempoReal.iniciar();

  // Guía para quien entra por primera vez (una vez por versión y dispositivo).
  mostrarTutorial();
}

document.addEventListener('DOMContentLoaded', iniciar);
