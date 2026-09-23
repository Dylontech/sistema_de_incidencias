/** Controlador de autenticación y del armazón de la aplicación. */
import { registrarAcciones } from '../core/eventos.js';
import { loading, preguntar, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { sesion } from '../core/session.js';
import * as loginView from '../views/login.view.js';
import * as notifView from '../views/notificaciones.view.js';
import { authService } from '../services/auth.service.js';
import * as aplicacion from '../core/aplicacion.js';

async function entrar(operacion) {
  loading(true, 'Iniciando sesión…');
  try {
    const respuesta = await operacion();
    sesion.guardar(respuesta);
    await aplicacion.arrancar({
      usuario: respuesta.usuario,
      municipioActivo: respuesta.municipioActivo
    });
    toast(`Bienvenido, ${respuesta.usuario.nombre}`, 'ok');
  } catch (error) {
    toast(error.message || 'No se pudo iniciar sesión', 'err');
  } finally {
    loading(false);
  }
}

export function registrar() {
  registrarAcciones({
    'auth:tab': ({ valor }) => loginView.mostrarPanel(valor),

    'auth:entrarAnonimo': () => entrar(() => authService.entrarAnonimo()),

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

    'auth:salir': () => {
      if (!preguntar('¿Cerrar sesión?')) return;
      sesion.limpiar();
      location.reload();
    },

    'sidebar:toggle': () => loginView.alternarSidebar(),

    'notificaciones:toggle': async ({ evento }) => {
      evento?.stopPropagation();
      const visible = notifView.alternarPanel();
      if (visible) {
        await intentar(async () => {
          await aplicacion.recargarNotificaciones();
        });
      }
    }
  });
}
