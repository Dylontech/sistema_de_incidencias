/**
 * ACCESO DEL PERSONAL (funcionarios, auditores, enlaces y administradores).
 *
 * Vive en su propia página (`/personal`) para que la pantalla de acceso de la
 * aplicación solo ofrezca el acceso ciudadano. La dirección no está enlazada
 * desde ninguna parte y lleva `noindex`.
 *
 * Mejoras de esta versión: mostrar/ocultar contraseña, aviso de Bloq Mayús,
 * recordar el usuario (nunca la contraseña), clave de municipio opcional para
 * los enlaces estatales/federales y mensajes de error específicos.
 */
import { $, $$ } from './core/utils.js';
import { loading, toast } from './core/ui.js';
import { sesion } from './core/session.js';
import { ROLES_PERSONAL } from './core/roles.js';
import { authService } from './services/auth.service.js';

/** A dónde se vuelve tras iniciar sesión (la aplicación aplica el paso previo). */
const DESTINO = '/';
const CLAVE_USUARIO = 'inc_staff_usuario';

function mostrarPanel(nombre) {
  $$('.login-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.panel === nombre);
  });
  $$('.login-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${nombre}`);
  });
  $('loginError')?.classList.add('u-oculto');
  $(nombre === 'admin' ? 'admin-user' : 'func-user')?.focus();
}

function mostrarError(mensaje) {
  const caja = $('loginError');
  if (!caja) {
    toast(mensaje, 'err');
    return;
  }
  caja.textContent = mensaje;
  caja.classList.remove('u-oculto');
  caja.focus?.();
}

/** Traduce el error del servidor a una acción concreta para la persona. */
function mensajeDeEntrada(error) {
  const estado = error?.estado || error?.status || 0;
  const texto = String(error?.message || '');
  if (estado === 429) {
    return 'Demasiados intentos. Espera unos minutos antes de volver a probar.';
  }
  if (estado === 403) {
    return texto || 'Tu cuenta no tiene acceso a este municipio o está suspendida.';
  }
  if (/clave/i.test(texto)) {
    return 'La clave de municipio no coincide con tu cuenta. Revísala o pide ayuda a un administrador.';
  }
  if (estado === 401) {
    return 'Usuario o contraseña incorrectos. Revisa mayúsculas y el Bloq Mayús.';
  }
  return texto || 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}

async function entrar(operacion) {
  $('loginError')?.classList.add('u-oculto');
  loading(true, 'Iniciando sesión…');
  try {
    const respuesta = await operacion();
    sesion.guardar(respuesta);
    toast(`Bienvenido, ${respuesta.usuario.nombre}`, 'ok');
    location.replace(DESTINO);
  } catch (error) {
    loading(false);
    mostrarError(mensajeDeEntrada(error));
  }
}

/** Botones de ojo para mostrar u ocultar la contraseña. */
function conectarVisibilidad() {
  $$('.pass-toggle').forEach((boton) => {
    boton.addEventListener('click', () => {
      const campo = $(boton.dataset.ver);
      if (!campo) return;
      const visible = campo.type === 'text';
      campo.type = visible ? 'password' : 'text';
      boton.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
      boton.title = visible ? 'Mostrar contraseña' : 'Ocultar contraseña';
      boton.innerHTML = `<i class="bi ${visible ? 'bi-eye' : 'bi-eye-slash'}"></i>`;
      campo.focus();
    });
  });
}

/** Aviso de Bloq Mayús mientras se escribe la contraseña. */
function conectarBloqMayus() {
  const aviso = $('funcCaps');
  if (!aviso) return;
  const actualizar = (evento) => {
    const activo = typeof evento.getModifierState === 'function' && evento.getModifierState('CapsLock');
    aviso.classList.toggle('u-oculto', !activo);
  };
  ['func-pass', 'admin-pass'].forEach((id) => {
    const campo = $(id);
    campo?.addEventListener('keydown', actualizar);
    campo?.addEventListener('keyup', actualizar);
    campo?.addEventListener('blur', () => aviso.classList.add('u-oculto'));
  });
}

/** Recordar el usuario (nunca la contraseña). */
function recordarUsuario(usuario, recordar) {
  if (recordar) localStorage.setItem(CLAVE_USUARIO, usuario);
  else localStorage.removeItem(CLAVE_USUARIO);
}

function conectar() {
  $$('.login-tab').forEach((tab) => {
    tab.addEventListener('click', () => mostrarPanel(tab.dataset.panel));
  });

  const recordado = localStorage.getItem(CLAVE_USUARIO) || '';
  if (recordado && $('func-user')) {
    $('func-user').value = recordado;
    $('recordarUsuario').checked = true;
  }

  conectarVisibilidad();
  conectarBloqMayus();

  $('formFunc').addEventListener('submit', (evento) => {
    evento.preventDefault();
    $('loginError')?.classList.add('u-oculto');

    const datos = {
      username: $('func-user').value.trim(),
      password: $('func-pass').value,
      // Un solo campo: el servidor prueba primero como clave de acceso nueva y,
      // si no lo es, como clave geoestadística del municipio.
      claveAcceso: $('func-code').value.trim(),
      claveMunicipio: $('func-code').value.trim()
    };

    if (!datos.username || !datos.password) {
      mostrarError('Escribe tu usuario y contraseña.');
      return;
    }

    recordarUsuario(datos.username, $('recordarUsuario').checked);
    entrar(() => authService.entrarFuncionario(datos));
  });

  $('formAdmin').addEventListener('submit', (evento) => {
    evento.preventDefault();
    $('loginError')?.classList.add('u-oculto');

    const datos = {
      username: $('admin-user').value.trim(),
      password: $('admin-pass').value
    };
    if (!datos.username || !datos.password) {
      mostrarError('Escribe tu usuario y contraseña.');
      return;
    }
    entrar(() => authService.entrarAdmin(datos));
  });
}

// Si ya hay una sesión del personal abierta en este dispositivo, esta página no
// debe mostrar su formulario: se vuelve a la aplicación, que valida el token y
// el rol. OJO: la aplicación crea una sesión ciudadana anónima de forma
// automática, así que tener token NO significa ser del personal; si se
// redirigiera con cualquier token, esta puerta quedaría inaccesible.
async function iniciar() {
  const guardada = sesion.cargar();
  const esPersonal = ROLES_PERSONAL.includes(guardada?.usuario?.rol);

  if (esPersonal) {
    try {
      // El servidor manda: puede haber caducado o haber sido revocada.
      await authService.yo();
      location.replace(DESTINO);
      return;
    } catch (error) {
      if (error?.estado === 403) mostrarError(mensajeDeEntrada(error));
      // Token caducado o cuenta sin acceso: se descarta y se muestra el form.
      sesion.limpiar();
    }
  }

  // La sesión anónima o ciudadana se conserva mientras se escribe la clave:
  // así no se pierden los reportes en curso si se cancela.
  conectar();
}

iniciar();
