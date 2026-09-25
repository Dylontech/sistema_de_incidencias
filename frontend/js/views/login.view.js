/** Vista de login y del armazón de la aplicación. */
import { $, $$, esc } from '../core/utils.js';
import { crearBuscador } from '../core/buscador.js';

/**
 * Buscador del municipio activo de la barra superior.
 * Se crea la primera vez que se usa, cuando el HTML ya está en el documento.
 */
let buscadorMunicipio = null;
function comboMunicipio() {
  if (!buscadorMunicipio) {
    buscadorMunicipio = crearBuscador({
      entrada: 'municipioBuscar',
      lista: 'municipioOpciones',
      fuente: 'municipioActivoSelect'
    });
  }
  return buscadorMunicipio;
}

export function mostrarPanel(nombre) {
  $$('.login-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.valor === nombre));
  $$('.login-panel').forEach((panel) => panel.classList.remove('active'));
  $(`panel-${nombre}`)?.classList.add('active');
  // El panel ciudadano siempre abre en el paso de elección (anónimo/cuenta).
  if (nombre === 'anon') mostrarModoAnon('inicio');
}

/**
 * Sub-pasos del panel «Ciudadano»: elegir, entrar con cuenta o registrarse.
 * Es una sola pestaña con tres vistas para no llenar la pantalla de acceso de
 * pestañas (el ciudadano de a pie es el caso más común y debe quedar primero).
 */
export function mostrarModoAnon(modo = 'inicio') {
  const vistas = { inicio: 'anonInicio', login: 'anonLogin', registro: 'anonRegistro' };
  Object.entries(vistas).forEach(([nombre, id]) => {
    const elemento = $(id);
    if (elemento) elemento.style.display = nombre === modo ? 'block' : 'none';
  });
  if (modo === 'registro') alternarPseudonimo(false);
  if (modo === 'login') $('ciud-correo')?.focus();
  if (modo === 'registro') $('reg-correo')?.focus();
}

/**
 * Alterna el nombre generado en el registro: cuando está marcado, el campo de
 * nombre se oculta porque el servidor sortea el pseudónimo.
 */
export function alternarPseudonimo(activo) {
  const casilla = $('reg-pseudonimo');
  if (casilla) casilla.checked = activo === true;
  const campo = $('reg-nombre');
  if (campo) campo.style.display = activo ? 'none' : 'block';
  const nota = $('regNombreNota');
  if (nota) {
    nota.textContent = activo
      ? 'Te asignaremos un nombre como «Águila Nocturna»: nadie sabrá quién eres y aun así recibirás los avisos de tus reportes.'
      : 'Escribe tu nombre o marca la casilla para que te asignemos un pseudónimo.';
  }
}

/**
 * Abre la pantalla de acceso del personal (funcionario/administrador) sin
 * perder la sesión ciudadana que ya está activa. Si hay sesión, se muestra la
 * «×» para volver a la aplicación. Mismo comportamiento que `Auth.mostrarLogin`.
 */
export function mostrarLogin({ puedeCancelar = false, panel = 'func' } = {}) {
  $('loginScreen').style.display = 'flex';
  const cancelar = $('loginCancelBtn');
  if (cancelar) cancelar.style.display = puedeCancelar ? 'block' : 'none';
  // El acceso del personal empieza en la pestaña de funcionario; quien llega
  // desde el aviso de «sesión anónima» aterriza en la del ciudadano.
  mostrarPanel(panel);
}

/** Cierra la pantalla de acceso y vuelve a la aplicación. */
export function cancelarLogin() {
  $('loginScreen').style.display = 'none';
}

/** Oculta el login y prepara la interfaz según el rol (paridad con Auth.iniciarApp). */
export function mostrarApp({ usuario, municipioActivo }) {
  $('loginScreen').style.display = 'none';
  $('app').classList.add('active');

  const esEmpleado = usuario.rol === 'funcionario' || usuario.rol === 'admin';
  // Cualquier cuenta (ciudadana o del personal) puede cerrar sesión; el enlace
  // «Personal» solo tiene sentido para quien no ha entrado con cuenta.
  const tieneCuenta = usuario.rol !== 'anonimo';
  $('btn-admin').style.display = esEmpleado ? 'inline-flex' : 'none';
  $('btn-informes').style.display = esEmpleado ? 'inline-flex' : 'none';
  $('btn-staff-login').style.display = esEmpleado ? 'none' : 'inline-flex';
  $('btn-logout').style.display = tieneCuenta ? 'inline-flex' : 'none';
  $('visibilidadNota').style.display = esEmpleado ? 'none' : 'block';

  $('userName').textContent = usuario.nombre;
  actualizarMunicipioTitulo(municipioActivo);
  actualizarNotaCuenta(usuario);

  // El funcionario está atado a su municipio: el selector se queda fijo.
  fijarSelectorMunicipio({
    bloqueado: usuario.rol === 'funcionario',
    motivo:
      usuario.rol === 'funcionario'
        ? 'Tu municipio asignado no se puede cambiar'
        : 'Municipio activo (catálogo del INEGI)'
  });
}

/**
 * Nota de la barra lateral para quien no es personal: explica si va a recibir
 * avisos (cuenta con correo) o no (sesión anónima).
 */
function actualizarNotaCuenta(usuario) {
  const nota = $('notaCuenta');
  if (!nota) return;
  if (usuario.rol === 'funcionario' || usuario.rol === 'admin') {
    nota.style.display = 'none';
    return;
  }
  nota.style.display = 'block';
  nota.innerHTML =
    usuario.rol === 'ciudadano'
      ? `<i class="bi bi-bell-fill"></i> Recibirás avisos de tus reportes en el buzón (la campana). Estás como <strong>${esc(usuario.nombre)}</strong>.`
      : `<i class="bi bi-bell-slash"></i> Estás como <strong>anónimo</strong>: puedes reportar, pero no recibirás avisos. <a href="#" data-action="auth:mostrarLogin" data-valor="anon">Crea una cuenta</a> para seguir tus reportes.`;
}

export function actualizarMunicipioTitulo(municipio) {
  const elemento = $('topbar-muni');
  if (elemento) elemento.textContent = municipio ? `${municipio.nombre}, ${municipio.estado}` : '—';

  const selector = $('municipioActivoSelect');
  if (selector && municipio) selector.value = municipio.id;
  comboMunicipio()?.sincronizar();

  $('loginSubtitulo').textContent = municipio
    ? `Municipio de ${municipio.nombre}, ${municipio.estado}`
    : 'Sistema de Incidencias Municipales';
}

/**
 * HTML de las opciones del catálogo, agrupadas por estado.
 *
 * El listado llega sin polígonos y ordenado por estado y nombre, así que se
 * agrupa con `optgroup` para no mezclar los municipios de un estado con los de
 * otro (en la Ciudad de México el INEGI codifica las alcaldías como
 * municipios). Lo usan el selector de la barra superior y el paso previo de
 * entrada.
 */
export function opcionesMunicipios(municipios = []) {
  const porEstado = new Map();
  for (const municipio of municipios) {
    const estado = municipio.estado || 'Sin estado';
    if (!porEstado.has(estado)) porEstado.set(estado, []);
    porEstado.get(estado).push(municipio);
  }

  return (
    [...porEstado.entries()]
      .map(
        ([estado, lista]) =>
          `<optgroup label="${esc(estado)}">` +
          lista.map((m) => `<option value="${esc(m.id)}">${esc(m.nombre)}</option>`).join('') +
          '</optgroup>'
      )
      .join('') || '<option value="">Sin municipios</option>'
  );
}

/**
 * Rellena el selector de municipio de la barra superior.
 * Un funcionario ve su municipio y no puede cambiarlo: el servidor ignora
 * cualquier otro, porque su alcance no se decide en el navegador.
 */
export function renderMunicipios(municipios = [], activoId = null) {
  const selector = $('municipioActivoSelect');
  if (!selector) return;

  selector.innerHTML = opcionesMunicipios(municipios);

  if (activoId) selector.value = activoId;

  // El buscador guarda el catálogo y refleja en el campo el valor del selector.
  comboMunicipio()?.cargar(municipios);
}

/** Bloquea el selector para quien no puede cambiar de municipio. */
export function fijarSelectorMunicipio({ bloqueado = false, motivo = '' } = {}) {
  const selector = $('municipioActivoSelect');
  if (!selector) return;
  selector.disabled = bloqueado;
  selector.title = motivo || 'Municipio activo';
  comboMunicipio()?.bloquear(bloqueado, selector.title);
}

export function valoresFuncionario() {
  return {
    username: $('func-user').value.trim(),
    password: $('func-pass').value,
    claveMunicipio: $('func-code').value.trim()
  };
}

export function valoresAdmin() {
  return {
    username: $('admin-user').value.trim(),
    password: $('admin-pass').value
  };
}

/** Credenciales de una cuenta ciudadana (se entra con el correo). */
export function valoresCiudadano() {
  return {
    correo: $('ciud-correo').value.trim(),
    password: $('ciud-pass').value
  };
}

/** Datos del alta de cuenta ciudadana. */
export function valoresRegistro() {
  return {
    correo: $('reg-correo').value.trim(),
    password: $('reg-pass').value,
    nombre: $('reg-nombre').value.trim(),
    pseudonimo: $('reg-pseudonimo')?.checked === true
  };
}

export function limpiarFormularios() {
  [
    'func-user',
    'func-pass',
    'func-code',
    'admin-user',
    'admin-pass',
    'ciud-correo',
    'ciud-pass',
    'reg-correo',
    'reg-pass',
    'reg-nombre'
  ].forEach((id) => {
    const campo = $(id);
    if (campo) campo.value = '';
  });
  alternarPseudonimo(false);
}

export function alternarSidebar() {
  $('sidebar')?.classList.toggle('collapsed');
}

export function cerrarSidebar() {
  $('sidebar')?.classList.add('collapsed');
}

/* --------------------- panel de leyenda del mapa --------------------- */

/** Muestra u oculta el panel de información (leyenda). */
export function alternarPanelInfo(abrir) {
  const panel = $('infoPanel');
  if (!panel) return false;
  return abrir === undefined ? panel.classList.toggle('show') : panel.classList.toggle('show', abrir);
}

export function panelInfoVisible() {
  return $('infoPanel')?.classList.contains('show') || false;
}
