/** Controlador de autenticación y del armazón de la aplicación. */
import { registrarAcciones } from '../core/eventos.js';
import { loading, preguntar, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { $ } from '../core/utils.js';
import { sesion } from '../core/session.js';
import { consentimiento } from '../core/consentimiento.js';
import { pedir as pedirConsentimiento } from './onboarding.controller.js';
import * as loginView from '../views/login.view.js';
import * as notifView from '../views/notificaciones.view.js';
import { authService } from '../services/auth.service.js';
import * as aplicacion from '../core/aplicacion.js';

async function entrar(
  operacion,
  {
    silencioso = false,
    antesDeArrancar = null,
    alFallar = null,
    textoCarga = 'Iniciando sesión…',
    mensajeExito = null
  } = {}
) {
  loading(true, textoCarga);
  try {
    const respuesta = await operacion();
    sesion.guardar(respuesta);
    loginView.cancelarLogin();

    // Paso previo (municipio + términos): puede cambiar el municipio activo.
    // Al iniciar sesión o registrarse solo se pregunta por los términos; el
    // municipio ya viene en la respuesta o se conserva de la sesión anterior.
    const contextoPrevio = {
      usuario: respuesta.usuario,
      municipioActivo: respuesta.municipioActivo
    };
    const previo = antesDeArrancar
      ? await antesDeArrancar(contextoPrevio)
      : await pedirConsentimiento({ ...contextoPrevio, soloTerminos: true });

    // Se llama a `arrancar` en ambos casos: el mapa es idempotente
    // (no se crea dos veces) y así el cambio de rol se refleja sin recargar.
    await aplicacion.arrancar({
      usuario: respuesta.usuario,
      municipioActivo: previo?.municipio || respuesta.municipioActivo
    });
    if (!silencioso) {
      const texto =
        (typeof mensajeExito === 'function' ? mensajeExito(respuesta) : mensajeExito) ||
        `Bienvenido, ${respuesta.usuario.nombre}`;
      toast(texto, 'ok');
    }
  } catch (error) {
    const aviso = error?.message || 'No se pudo iniciar sesión';
    // Dentro del acceso el error se pinta en la tarjeta; fuera de él (arranque
    // silencioso) se usa el toast.
    if (alFallar) alFallar(error, aviso);
    else toast(aviso, 'err');
  } finally {
    loading(false);
  }
}

/** Deshabilita el botón de envío mientras dura la petición (evita duplicados). */
function ocupado(formulario, activo) {
  const boton = formulario?.querySelector?.('button[type="submit"]');
  if (!boton) return;
  boton.disabled = activo === true;
  if (activo) boton.setAttribute('aria-busy', 'true');
  else boton.removeAttribute('aria-busy');
}

/** Traduce los errores frecuentes del alta y del acceso a un aviso claro. */
function avisoDeError(error, porDefecto) {
  if (error?.estado === 429) {
    return 'Demasiados intentos seguidos. Espera un momento e inténtalo de nuevo.';
  }
  if (error?.estado === 0) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión.';
  }
  // Un 400 de validación trae el detalle por campo: es más útil que «Datos inválidos».
  const detalle = Array.isArray(error?.detalles)
    ? error.detalles.find((entrada) => entrada?.mensaje)
    : null;
  if (error?.estado === 400 && detalle) return detalle.mensaje;
  return error?.message || porDefecto;
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

    /**
     * El nombre del alta ya tiene cuenta: se abre el acceso con ese nombre
     * escrito para que solo falte la contraseña.
     */
    'auth:usarNombre': ({ valor }) => loginView.prepararLogin({ nombre: valor || '' }),

    /** Casilla del nombre generado en el registro. */
    'auth:pseudonimo': ({ evento }) =>
      loginView.alternarPseudonimo(evento?.target?.checked === true),

    'auth:entrarAnonimo': () => entrarComoCiudadano(),

    /** Entrada con una cuenta ciudadana (nombre o pseudónimo + contraseña). */
    'auth:entrarCiudadano': async ({ elemento }) => {
      const datos = loginView.valoresCiudadano();
      if (!datos.nombre || !datos.password) {
        loginView.mensaje('Escribe tu nombre y tu contraseña', 'err');
        $('ciud-nombre')?.focus();
        return;
      }
      loginView.limpiarMensaje();
      ocupado(elemento, true);
      try {
        await entrar(() => authService.entrarCiudadano(datos), {
          textoCarga: 'Entrando a tu cuenta…',
          alFallar: (error, aviso) =>
            loginView.mensaje(avisoDeError(error, 'Nombre o contraseña incorrectos'), 'err')
        });
      } finally {
        ocupado(elemento, false);
      }
    },

    /** Alta de cuenta: nombre real o pseudónimo generado por el servidor. */
    'auth:registrar': async ({ elemento }) => {
      const datos = loginView.valoresRegistro();
      if (!datos.correo || !datos.password) {
        loginView.mensaje('Escribe tu correo y una contraseña', 'err');
        $('reg-correo')?.focus();
        return;
      }
      if (datos.password.length < 8) {
        loginView.mensaje('La contraseña debe tener al menos 8 caracteres', 'err');
        $('reg-pass')?.focus();
        return;
      }
      if (!datos.pseudonimo && !datos.nombre) {
        loginView.mensaje('Escribe tu nombre o marca «Usar un nombre generado»', 'err');
        $('reg-nombre')?.focus();
        return;
      }

      loginView.limpiarMensaje();
      ocupado(elemento, true);
      try {
        await entrar(() => authService.registrarCiudadano(datos), {
          textoCarga: 'Creando tu cuenta…',
          mensajeExito: (respuesta) =>
            `Tu cuenta quedó como «${respuesta.usuario?.nombre || datos.nombre}». Entra con ese nombre y tu contraseña.`,
          alFallar: (error, aviso) => {
            // El nombre es la credencial de acceso y el correo el canal de
            // avisos: el 409 puede venir de cualquiera de los dos y se guía a
            // la persona al campo correcto.
            if (error?.estado === 409) {
              if (/correo/i.test(aviso || '')) {
                loginView.mensaje(
                  'Ese correo ya está registrado en otra cuenta. Usa otro correo o entra con tu nombre y contraseña.',
                  'err',
                  {
                    accion: {
                      etiqueta: 'Entrar a mi cuenta',
                      accion: 'auth:modoAnon',
                      valor: 'login'
                    }
                  }
                );
                $('reg-correo')?.focus();
              } else {
                loginView.mensaje(
                  'Ese nombre ya tiene una cuenta. Si es tuya, entra con tu contraseña; si no, elige otro nombre.',
                  'err',
                  {
                    accion: {
                      etiqueta: 'Entrar con este nombre',
                      accion: 'auth:usarNombre',
                      valor: datos.nombre
                    }
                  }
                );
                $('reg-nombre')?.focus();
              }
              return;
            }
            loginView.mensaje(avisoDeError(error, 'No se pudo crear la cuenta'), 'err');
          }
        });
      } finally {
        ocupado(elemento, false);
      }
    },

    /**
     * Abre la pantalla de acceso ciudadano sin perder la sesión anónima.
     * `valor` decide el paso: «registro» abre el alta de cuenta (botón de la
     * barra superior) y cualquier otro abre el inicio. El acceso del personal
     * ya no está aquí: vive en `/personal`.
     */
    'auth:mostrarLogin': ({ valor }) =>
      loginView.mostrarLogin({
        puedeCancelar: !!sesion.datos,
        modo: valor === 'registro' ? 'registro' : valor === 'login' ? 'login' : 'inicio'
      }),

    'auth:cancelarLogin': () => loginView.cancelarLogin(),

    'auth:salir': async () => {
      if (!(await preguntar('¿Cerrar sesión? Volverás al modo ciudadano anónimo.'))) return;
      sesion.limpiar();
      location.reload();
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
