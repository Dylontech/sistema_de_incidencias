/** Controlador de autenticación y del armazón de la aplicación. */
import { registrarAcciones } from '../core/eventos.js';
import { loading, preguntar, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { $ } from '../core/utils.js';
import { sesion } from '../core/session.js';
import * as loginView from '../views/login.view.js';
import * as notifView from '../views/notificaciones.view.js';
import { authService } from '../services/auth.service.js';
import * as aplicacion from '../core/aplicacion.js';

async function entrar(operacion, { silencioso = false } = {}) {
  loading(true, 'Iniciando sesión…');
  try {
    const respuesta = await operacion();
    sesion.guardar(respuesta);
    loginView.cancelarLogin();
    // Se llama a `arrancar` en ambos casos: el mapa es idempotente
    // (no se crea dos veces) y así el cambio de rol se refleja sin recargar.
    await aplicacion.arrancar({
      usuario: respuesta.usuario,
      municipioActivo: respuesta.municipioActivo
    });
    if (!silencioso) toast(`Bienvenido, ${respuesta.usuario.nombre}`, 'ok');
  } catch (error) {
    toast(error.message || 'No se pudo iniciar sesión', 'err');
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
export async function entrarComoCiudadano({ silencioso = false } = {}) {
  // Si el ciudadano ya eligió un municipio, se conserva al volver a entrar.
  const municipioId = sesion.datos?.municipioActivo?.id || null;
  return entrar(() => authService.entrarAnonimo({ municipioId }), { silencioso });
}

export function registrar() {
  registrarAcciones({
    'auth:tab': ({ valor }) => loginView.mostrarPanel(valor),

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
      return entrar(() => authService.entrarCiudadano(datos));
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
      return entrar(() => authService.registrarCiudadano(datos));
    },

    'auth:entrarFuncionario': () => {
      const datos = loginView.valoresFuncionario();
      if (!datos.username || !datos.password || !datos.claveMunicipio) {
        toast('Completa todos los campos', 'err');
        return;
      }
      return entrar(() => authService.entrarFuncionario(datos));
    },

    'auth:entrarAdmin': () => {
      const datos = loginView.valoresAdmin();
      if (!datos.username || !datos.password) {
        toast('Completa todos los campos', 'err');
        return;
      }
      return entrar(() => authService.entrarAdmin(datos));
    },

    /** Acceso del personal sin perder la sesión ciudadana. */
    'auth:mostrarLogin': ({ valor }) =>
      loginView.mostrarLogin({ puedeCancelar: !!sesion.datos, panel: valor || 'func' }),

    'auth:cancelarLogin': () => loginView.cancelarLogin(),

    'auth:salir': () => {
      if (!preguntar('¿Cerrar sesión? Volverás al modo ciudadano anónimo.')) return;
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
