/**
 * ACCESO DEL PERSONAL (funcionario y administrador).
 *
 * Vive en su propia página (`/personal`) para que la pantalla de acceso de la
 * aplicación solo ofrezca el acceso ciudadano. La dirección no está enlazada
 * desde ninguna parte y lleva `noindex`, así que solo entra quien la conoce.
 *
 * Reutiliza las piezas de la aplicación en lugar de duplicarlas:
 *   - `services/auth.service.js` para las mismas llamadas a la API;
 *   - `core/session.js` para guardar la sesión (el token vive en localStorage,
 *     que es del mismo origen, así que la aplicación la restaura al volver);
 *   - `core/ui.js` para el aviso y el indicador de carga.
 */
import { $, $$ } from './core/utils.js';
import { loading, toast } from './core/ui.js';
import { sesion } from './core/session.js';
import { authService } from './services/auth.service.js';

/** A dónde se vuelve tras iniciar sesión (la aplicación aplica el paso previo). */
const DESTINO = '/';

function mostrarPanel(nombre) {
  $$('.login-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.panel === nombre);
  });
  $$('.login-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${nombre}`);
  });
  $(nombre === 'admin' ? 'admin-user' : 'func-user')?.focus();
}

async function entrar(operacion) {
  loading(true, 'Iniciando sesión…');
  try {
    const respuesta = await operacion();
    sesion.guardar(respuesta);
    toast(`Bienvenido, ${respuesta.usuario.nombre}`, 'ok');
    location.replace(DESTINO);
  } catch (error) {
    loading(false);
    // Mismo criterio que la entrada ciudadana: manda el mensaje del servidor
    // («Usuario o contraseña incorrectos»), no el genérico de sesión caducada.
    toast(error.message || 'No se pudo iniciar sesión', 'err');
  }
}

function conectar() {
  $$('.login-tab').forEach((tab) => {
    tab.addEventListener('click', () => mostrarPanel(tab.dataset.panel));
  });

  $('formFunc').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const datos = {
      username: $('func-user').value.trim(),
      password: $('func-pass').value,
      claveMunicipio: $('func-code').value.trim()
    };
    if (!datos.username || !datos.password || !datos.claveMunicipio) {
      toast('Completa todos los campos', 'err');
      return;
    }
    entrar(() => authService.entrarFuncionario(datos));
  });

  $('formAdmin').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const datos = {
      username: $('admin-user').value.trim(),
      password: $('admin-pass').value
    };
    if (!datos.username || !datos.password) {
      toast('Completa todos los campos', 'err');
      return;
    }
    entrar(() => authService.entrarAdmin(datos));
  });
}

conectar();
