/** Controlador de autenticación y del armazón de la aplicación. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, loading, preguntar, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { $, descargar } from '../core/utils.js';
import { sesion } from '../core/session.js';
import { consentimiento } from '../core/consentimiento.js';
import * as loginView from '../views/login.view.js';
import * as cuentaView from '../views/cuenta.view.js';
import * as notifView from '../views/notificaciones.view.js';
import { authService } from '../services/auth.service.js';
import * as aplicacion from '../core/aplicacion.js';

/** Mensaje de espera cuando el servidor bloquea por intentos fallidos. */
function avisoDeBloqueo(error) {
  const segundos = Number(error?.detalles?.reintentarEnSegundos || 0);
  if (!segundos) return error.message;
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return `${error.message} (${minutos} ${minutos === 1 ? 'minuto' : 'minutos'})`;
}

/**
 * Trámites a medias que llegan en la dirección: `?verificar=<código>` y
 * `?restablecer=<código>`.
 *
 * Los códigos se quedan aquí, en memoria, y no en `localStorage`: solo hacen
 * falta mientras la pestaña está abierta, y así no quedan guardados en el
 * equipo después.
 */
const pendiente = { verificar: null, restablecer: null, correo: null };

/** Recoge los códigos que vienen en la dirección (lo llama `main.js`). */
export function recordarEnlaces({ verificar = null, restablecer = null } = {}) {
  pendiente.verificar = verificar;
  pendiente.restablecer = restablecer;
}

/**
 * Paso de la pantalla de acceso que hay que dejar abierto al terminar de
 * arrancar (
 * por ejemplo, el formulario de contraseña nueva tras abrir el enlace del correo).
 */
let pasoPendiente = null;

/**
 * Muestra la pantalla de acceso en un paso concreto.
 * El orden importa: `mostrarLogin` vuelve siempre al paso inicial, así que el
 * paso deseado se fija después.
 */
function abrirPasoDeAcceso(paso) {
  loginView.mostrarLogin({ puedeCancelar: !!sesion.datos });
  if (paso) loginView.mostrarModoAnon(paso);
}

/**
 * Deja abierta la pantalla de acceso en el paso que quedó pendiente.
 * Se llama al final del arranque: si se mostrara antes, el paso previo
 * (municipio y términos) o el propio arranque la taparían.
 */
export function mostrarPasoDeAccesoPendiente() {
  if (!pasoPendiente) return false;
  const paso = pasoPendiente;
  pasoPendiente = null;
  abrirPasoDeAcceso(paso);
  return true;
}

/**
 * Confirma el correo si se llegó desde el enlace del mensaje.
 * La petición se hace ya (no espera al arranque) para que el ciudadano vea el
 * aviso cuanto antes; la pantalla de acceso se enseña al final del arranque.
 */
export async function procesarEnlaceDeVerificacion() {
  if (!pendiente.verificar) return false;
  const codigo = pendiente.verificar;
  pendiente.verificar = null;

  loading(true, 'Confirmando tu correo…');
  try {
    const respuesta = await authService.verificarCorreo(codigo);
    toast(respuesta.mensaje, 'ok');
    loginView.rellenarCorreoInicioDeSesion(respuesta.correo);
  } catch (error) {
    toast(error.message || 'No se pudo confirmar el correo', 'err');
  } finally {
    loading(false);
  }

  pasoPendiente = 'login';
  return true;
}

/** Deja pendiente el formulario de contraseña nueva si se llegó desde el enlace. */
export function procesarEnlaceDeRestablecimiento() {
  if (!pendiente.restablecer) return false;
  pasoPendiente = 'restablecer';
  return true;
}

async function entrar(operacion, { silencioso = false, antesDeArrancar = null, alFallar = null } = {}) {
  loading(true, 'Iniciando sesión…');
  try {
    const respuesta = await operacion();
    sesion.guardar(respuesta);
    loginView.cancelarLogin();

    // Paso previo (municipio + términos): puede cambiar el municipio activo.
    const previo = antesDeArrancar
      ? await antesDeArrancar({
          usuario: respuesta.usuario,
          municipioActivo: respuesta.municipioActivo
        })
      : null;

    // Se llama a `arrancar` en ambos casos: el mapa es idempotente
    // (no se crea dos veces) y así el cambio de rol se refleja sin recargar.
    await aplicacion.arrancar({
      usuario: respuesta.usuario,
      municipioActivo: previo?.municipio || respuesta.municipioActivo
    });
    if (!silencioso) toast(`Bienvenido, ${respuesta.usuario.nombre}`, 'ok');
  } catch (error) {
    // Quien llama puede reaccionar al fallo (por ejemplo, al correo sin
    // confirmar se le lleva a la pantalla del enlace).
    const atendido = alFallar ? alFallar(error) : null;
    if (!atendido) {
      if (error?.estado === 429) toast(avisoDeBloqueo(error), 'err');
      else toast(error.message || 'No se pudo iniciar sesión', 'err');
    }
  } finally {
    loading(false);
  }
}

/**
 * Entra como ciudadano anónimo. La usa el botón del panel «Ciudadano» y el
 * arranque de la aplicación cuando no hay sesión guardada: el público no pasa
 * por la pantalla de acceso (decisión de la versión nueva del monolito).
 * Con `silencioso` no muestra el aviso de bienvenida (arranque automático).
 */
export async function entrarComoCiudadano({ silencioso = false, antesDeArrancar = null } = {}) {
  // El municipio elegido (en el paso previo o en la barra superior) se conserva.
  const municipioId =
    sesion.datos?.municipioActivo?.id || consentimiento.municipioId() || null;
  return entrar(() => authService.entrarAnonimo({ municipioId }), {
    silencioso,
    antesDeArrancar
  });
}

export function registrar() {
  registrarAcciones({
    /** Sub-pasos del panel ciudadano (inicio / entrar / crear cuenta). */
    'auth:modoAnon': ({ valor }) => loginView.mostrarModoAnon(valor || 'inicio'),

    /** Casilla del nombre generado en el registro. */
    'auth:pseudonimo': ({ evento }) =>
      loginView.alternarPseudonimo(evento?.target?.checked === true),

    'auth:entrarAnonimo': () => entrarComoCiudadano(),

    /** Entrada con una cuenta ciudadana (correo + contraseña). */
    'auth:entrarCiudadano': () => {
      const datos = loginView.valoresCiudadano();
      if (!datos.correo || !datos.password) {
        toast('Completa todos los campos', 'err');
        return;
      }
      return entrar(() => authService.entrarCiudadano(datos), {
        // Si la cuenta está esperando la confirmación del correo, se le lleva
        // a la pantalla del enlace (con la opción de pedir otro).
        alFallar: (error) => {
          if (error?.estado !== 403 || !/confirmado tu correo/i.test(error.message)) return null;
          toast(error.message, 'err');
          pendiente.correo = datos.correo;
          loginView.mostrarAvisoDeVerificacion(datos.correo, { puedeCancelar: !!sesion.datos });
          return true;
        }
      });
    },

    /** Alta de cuenta: nombre real o pseudónimo generado por el servidor. */
    'auth:registrar': () => {
      const datos = loginView.valoresRegistro();
      if (!datos.correo || !datos.password) {
        toast('Escribe tu correo y una contraseña', 'err');
        return;
      }
      if (datos.password.length < 8) {
        toast('La contraseña debe tener al menos 8 caracteres', 'err');
        return;
      }
      if (!datos.pseudonimo && !datos.nombre) {
        toast('Escribe tu nombre o elige un nombre generado', 'err');
        return;
      }
      return intentar(async () => {
        loading(true, 'Creando la cuenta…');
        try {
          const respuesta = await authService.registrarCiudadano(datos);
          // Desde aquí no hay sesión: la cuenta espera la confirmación del
          // correo, así que se explica qué falta en lugar de dejarla en blanco.
          pendiente.correo = respuesta.correo || datos.correo;
          loginView.mostrarAvisoDeVerificacion(pendiente.correo, {
            puedeCancelar: !!sesion.datos
          });
          toast(respuesta.mensaje || 'Revisa tu correo para activar la cuenta', 'ok');
        } finally {
          loading(false);
        }
      });
    },

    /** Paso «¿Olvidaste tu contraseña?»: pide el enlace de recuperación. */
    'auth:olvide': () => {
      const { correo } = loginView.valoresOlvide();
      if (!correo) {
        toast('Escribe el correo de tu cuenta', 'err');
        return;
      }
      return intentar(async () => {
        loading(true, 'Enviando el enlace…');
        try {
          const respuesta = await authService.olvide({ correo });
          loginView.mostrarModoAnon('login');
          toast(respuesta.mensaje, 'ok');
        } finally {
          loading(false);
        }
      });
    },

    /** Contraseña nueva con el enlace que llegó por correo. */
    'auth:restablecer': () => {
      const { password, password2 } = loginView.valoresRestablecer();
      const token = pendiente?.restablecer;
      if (!password || password.length < 8) {
        toast('La contraseña debe tener al menos 8 caracteres', 'err');
        return;
      }
      if (password !== password2) {
        toast('Las dos contraseñas no coinciden', 'err');
        return;
      }
      return intentar(async () => {
        loading(true, 'Guardando la contraseña…');
        try {
          const respuesta = await authService.restablecer({ token, password });
          pendiente.restablecer = null;
          sesion.guardar(respuesta);
          loginView.cancelarLogin();
          await aplicacion.arrancar({ usuario: respuesta.usuario, municipioActivo: null });
          toast('Contraseña cambiada. Ya estás dentro de tu cuenta.', 'ok');
        } finally {
          loading(false);
        }
      });
    },

    /** Enlace de confirmación desde la pantalla de «revisa tu correo». */
    'auth:reenviar': () => {
      const correo =
        pendiente.correo ||
        loginView.valoresCiudadano().correo ||
        loginView.valoresRegistro().correo;
      if (!correo) {
        loginView.mostrarModoAnon('login');
        toast('Escribe tu correo y te enviamos un enlace nuevo', 'err');
        return;
      }
      return intentar(async () => {
        loading(true, 'Enviando el enlace…');
        try {
          const respuesta = await authService.reenviarVerificacion(correo);
          toast(respuesta.mensaje, 'ok');
        } finally {
          loading(false);
        }
      });
    },

    /**
     * Abre la pantalla de acceso ciudadano sin perder la sesión anónima.
     * El acceso del personal ya no está aquí: vive en `/personal`.
     */
    'auth:mostrarLogin': () => loginView.mostrarLogin({ puedeCancelar: !!sesion.datos }),

    'auth:cancelarLogin': () => loginView.cancelarLogin(),

    'auth:salir': () => {
      if (!preguntar('¿Cerrar sesión? Volverás al modo ciudadano anónimo.')) return;
      sesion.limpiar();
      location.reload();
    },

    /* ------------------------------ Mi cuenta ---------------------------- */

    /**
     * Abre el modal de la cuenta. Con `valor: 'verificacion'` (enlace del aviso)
     * se resalta el bloque del correo sin confirmar.
     */
    'cuenta:abrir': () => {
      if (!sesion.usuario) {
        toast('Necesitas una cuenta para gestionarla', 'err');
        return;
      }
      // Los datos guardados pueden ser de antes de confirmar el correo: se
      // refresca el estado en el servidor para no enseñar un aviso equivocado.
      cuentaView.preparar(sesion.usuario);
      abrirModal('modalCuenta');
      intentar(async () => {
        const { usuario } = await authService.yo();
        sesion.actualizarUsuario(usuario);
        cuentaView.preparar(usuario);
      });
    },

    'cuenta:cambiarPassword': () => {
      const { actual, nueva, nueva2 } = cuentaView.valoresPassword();
      if (!actual || !nueva) {
        toast('Completa los dos campos de contraseña', 'err');
        return;
      }
      if (nueva.length < 8) {
        toast('La contraseña nueva debe tener al menos 8 caracteres', 'err');
        return;
      }
      if (nueva !== nueva2) {
        toast('Las dos contraseñas nuevas no coinciden', 'err');
        return;
      }
      return intentar(async () => {
        loading(true, 'Cambiando la contraseña…');
        try {
          const respuesta = await authService.cambiarPassword({ actual, nueva });
          // El token anterior quedó invalidado al subir la versión de sesión:
          // se guarda el nuevo para no cerrar la sesión que acaba de cambiarla.
          sesion.renovarToken(respuesta.token, respuesta.usuario);
          cuentaView.limpiarFormularios();
          toast(respuesta.mensaje, 'ok');
        } finally {
          loading(false);
        }
      });
    },

    'cuenta:reenviar': () =>
      intentar(async () => {
        loading(true, 'Enviando el enlace…');
        try {
          const respuesta = await authService.reenviarVerificacionDeCuenta();
          cuentaView.preparar({ ...sesion.usuario, correoVerificado: respuesta.yaVerificado });
          toast(respuesta.mensaje, 'ok');
        } finally {
          loading(false);
        }
      }),

    /** Descarga un JSON con todo lo que el sistema guarda de la cuenta. */
    'cuenta:descargar': () =>
      intentar(async () => {
        loading(true, 'Reuniendo tus datos…');
        try {
          const datos = await authService.datosDeLaCuenta();
          const fecha = new Date().toISOString().slice(0, 10);
          descargar(JSON.stringify(datos, null, 2), `mis-datos-incidencias-${fecha}.json`, 'application/json');
          toast('Descarga lista', 'ok');
        } finally {
          loading(false);
        }
      }),

    'cuenta:eliminar': () => {
      const { password, confirmado } = cuentaView.valoresBaja();
      if (!confirmado) {
        toast('Marca la casilla para confirmar que quieres darte de baja', 'err');
        return;
      }
      if (!password) {
        toast('Escribe tu contraseña para confirmar', 'err');
        return;
      }
      return intentar(async () => {
        loading(true, 'Eliminando la cuenta…');
        try {
          const respuesta = await authService.eliminarCuenta({ password });
          cerrarModal('modalCuenta');
          toast(respuesta.mensaje, 'ok');
          // La sesión queda sin cuenta detrás: se vuelve a la ciudadanía anónima.
          sesion.limpiar();
          setTimeout(() => location.reload(), 1500);
        } finally {
          loading(false);
        }
      });
    },

    'sidebar:toggle': () => aplicacion.alternarSidebar(),

    /**
     * Cambio de municipio activo desde la barra superior.
     * Es público: el ciudadano anónimo recorre el catálogo del estado para
     * reportar en el municipio que le corresponde. El funcionario no puede
     * cambiar (su alcance lo fija el servidor), así que su selector va
     * deshabilitado.
     */
    'municipio:cambiar': ({ valor }) =>
      intentar(async () => {
        const municipioId = valor || $('municipioActivoSelect')?.value;
        if (!municipioId) return;
        loading(true, 'Cambiando de municipio…');
        try {
          const municipio = await aplicacion.cambiarMunicipio(municipioId);
          toast(`Ahora ves ${municipio?.nombre || 'el municipio elegido'}`, 'ok');
        } finally {
          loading(false);
        }
      }),

    'notificaciones:toggle': async ({ evento }) => {
      evento?.stopPropagation();
      const visible = notifView.alternarPanel();
      if (!visible) return;
      // Los dos paneles de la barra superior nunca se muestran a la vez.
      loginView.alternarPanelInfo(false);
      await intentar(() => aplicacion.recargarNotificaciones());
    },

    'info:toggle': ({ evento }) => {
      evento?.stopPropagation();
      const visible = loginView.alternarPanelInfo();
      if (visible) notifView.alternarPanel(false);
    }
  });
}

/** Cierra los paneles de la barra superior al pulsar fuera de ellos. */
export function conectarCierreDePaneles() {
  document.addEventListener('click', (evento) => {
    const panelNotif = $('notifPanel');
    const panelInfo = $('infoPanel');

    if (
      panelNotif?.classList.contains('show') &&
      !panelNotif.contains(evento.target) &&
      !evento.target.closest('[data-action="notificaciones:toggle"]')
    ) {
      notifView.alternarPanel(false);
    }

    if (
      panelInfo?.classList.contains('show') &&
      !panelInfo.contains(evento.target) &&
      !evento.target.closest('[data-action="info:toggle"]')
    ) {
      loginView.alternarPanelInfo(false);
    }
  });
}
