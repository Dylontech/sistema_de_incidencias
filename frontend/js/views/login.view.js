/** Vista de login y del armazón de la aplicación. */
import { $, esc } from '../core/utils.js';
import { crearBuscador } from '../core/buscador.js';
import { esPersonal, puedeAtenderTickets } from '../core/roles.js';

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

/**
 * Sub-pasos del panel «Ciudadano»: elegir, entrar con cuenta o registrarse.
 * Es la única vía de acceso de esta pantalla: el acceso del personal vive en
 * `/personal` (ver `js/personal.js`), una página sin enlaces.
 */
export function mostrarModoAnon(modo = 'inicio') {
  const vistas = { inicio: 'anonInicio', login: 'anonLogin', registro: 'anonRegistro' };
  const elegido = vistas[modo] ? modo : 'inicio';
  Object.entries(vistas).forEach(([nombre, id]) => {
    const elemento = $(id);
    if (elemento) elemento.hidden = nombre !== elegido;
  });
  // Cada sub-paso arranca sin el aviso del anterior.
  limpiarMensaje();
  if (elegido === 'registro') alternarPseudonimo(false);
  if (elegido === 'login') $('ciud-nombre')?.focus();
  if (elegido === 'registro') $('reg-correo')?.focus();
}

/**
 * Aviso dentro de la tarjeta de acceso.
 *
 * Es independiente del toast: la pantalla de acceso es una capa fija y el
 * aviso debe verse siempre. `accion` añade un botón que dispara una acción de
 * la delegación (por ejemplo, pasar al acceso con el correo ya escrito).
 */
export function mensaje(texto, tipo = 'err', { accion = null } = {}) {
  const caja = $('loginMensaje');
  if (!caja) return;
  caja.className = `publico-msg ${tipo}`;
  caja.textContent = texto || '';
  caja.hidden = false;
  caja.classList.remove('u-oculto');

  if (accion?.etiqueta) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-outline btn-sm u-mt-8';
    boton.textContent = accion.etiqueta;
    if (accion.accion) boton.dataset.action = accion.accion;
    if (accion.valor !== undefined && accion.valor !== null) {
      boton.dataset.valor = String(accion.valor);
    }
    caja.append(boton);
  }
}

export function limpiarMensaje() {
  const caja = $('loginMensaje');
  if (!caja) return;
  caja.textContent = '';
  caja.className = 'publico-msg u-oculto';
  caja.hidden = true;
}

/**
 * Alterna el nombre generado en el registro: cuando está marcado, el campo de
 * nombre se oculta porque el servidor sortea el pseudónimo.
 */
export function alternarPseudonimo(activo) {
  const marcado = activo === true;
  const casilla = $('reg-pseudonimo');
  if (casilla) casilla.checked = marcado;
  // Se oculta el bloque completo (etiqueta + campo) y se apaga el `required`
  // para que un campo oculto no bloquee el envío.
  const bloque = $('regNombreCampo') || $('reg-nombre');
  if (bloque) {
    bloque.hidden = marcado;
    bloque.classList.toggle('u-oculto', marcado);
  }
  const campo = $('reg-nombre');
  if (campo) campo.required = !marcado;
  const nota = $('regNombreNota');
  if (nota) {
    nota.textContent = marcado
      ? 'Te asignaremos un nombre libre, como «Águila Nocturna»: nadie sabrá quién eres y aun así recibirás los avisos de tus reportes.'
      : 'Con este nombre entrarás a tu cuenta y aparecerá en tus reportes; no puede repetirse.';
  }
}

/**
 * Abre la pantalla de acceso ciudadano sin perder la sesión anónima que ya está
 * activa. Si hay sesión, se muestra la «×» para volver a la aplicación.
 * `modo` permite entrar directo al alta de cuenta (`registro`) o al inicio de
 * sesión (`login`), que es lo que usan los accesos de la vista principal.
 */
export function mostrarLogin({ puedeCancelar = false, modo = 'inicio' } = {}) {
  const pantalla = $('loginScreen');
  if (pantalla) pantalla.hidden = false;
  const cancelar = $('loginCancelBtn');
  if (cancelar) {
    cancelar.hidden = !puedeCancelar;
    cancelar.classList.toggle('u-oculto', !puedeCancelar);
  }
  mostrarModoAnon(modo);
}

/**
 * Abre el acceso con el nombre ya escrito.
 * Se usa cuando el servidor avisa de que ese nombre ya tiene cuenta: así la
 * persona solo escribe su contraseña en lugar de volver a empezar.
 */
export function prepararLogin({ nombre = '' } = {}) {
  const pantalla = $('loginScreen');
  if (pantalla) pantalla.hidden = false;
  mostrarModoAnon('login');
  const campo = $('ciud-nombre');
  if (campo && nombre) campo.value = nombre;
  $('ciud-pass')?.focus();
}

/** ¿Está visible la pantalla de acceso? */
export function estaVisible() {
  const pantalla = $('loginScreen');
  return Boolean(pantalla && !pantalla.hidden);
}

/** Cierra la pantalla de acceso y vuelve a la aplicación. */
export function cancelarLogin() {
  const pantalla = $('loginScreen');
  if (pantalla) pantalla.hidden = true;
}

/** Oculta el login y prepara la interfaz según el rol (paridad con Auth.iniciarApp). */
export function mostrarApp({ usuario, municipioActivo }) {
  const pantalla = $('loginScreen');
  if (pantalla) pantalla.hidden = true;
  $('app').classList.add('active');

  const esEmpleado = esPersonal(usuario);
  const permisos = new Set(usuario.permisos || []);
  const puede = (clave) => usuario.rol === 'admin' || permisos.has(clave);
  // Cualquier cuenta (ciudadana o del personal) puede cerrar sesión.
  const tieneCuenta = usuario.rol !== 'anonimo';
  $('btn-admin').style.display = esEmpleado ? 'inline-flex' : 'none';
  $('btn-monitoreo').style.display =
    esEmpleado && puede('ver_monitoreo') ? 'inline-flex' : 'none';
  $('btn-bandeja').style.display = esEmpleado ? 'inline-flex' : 'none';
  $('btn-servidor').style.display = usuario.rol === 'admin' ? 'inline-flex' : 'none';
  $('btn-notif-config').style.display = esEmpleado ? 'inline-flex' : 'none';
  $('btn-informes').style.display =
    esEmpleado && puede('exportar') ? 'inline-flex' : 'none';
  $('btn-logout').style.display = tieneCuenta ? 'inline-flex' : 'none';
  $('visibilidadNota').style.display = esEmpleado ? 'none' : 'block';
  // El acceso al alta de cuenta solo tiene sentido para quien entró como
  // anónimo: con cuenta ciudadana o del personal ya no se muestra.
  const botonRegistro = $('btn-registro');
  if (botonRegistro) botonRegistro.style.display = usuario.rol === 'anonimo' ? 'inline-flex' : 'none';
  const botonLogin = $('btn-login');
  if (botonLogin) botonLogin.style.display = usuario.rol === 'anonimo' ? 'inline-flex' : 'none';

  // El panel técnico solo tiene sentido para quien atiende tickets.
  const enlaceSoporte = $('linkSoporte');
  if (enlaceSoporte) {
    const atiende = puedeAtenderTickets(usuario);
    enlaceSoporte.hidden = !atiende;
    enlaceSoporte.setAttribute('aria-hidden', String(!atiende));
  }

  // Tickets y solicitudes de informe exigen una cuenta registrada. La sesión
  // anónima puede reportar, pero no abrir estos trámites.
  for (const id of ['linkTickets', 'linkInformesPublicos']) {
    const enlace = $(id);
    if (!enlace) continue;
    enlace.hidden = !tieneCuenta;
    enlace.setAttribute('aria-hidden', String(!tieneCuenta));
  }

  $('userName').textContent = usuario.nombre;
  actualizarMunicipioTitulo(municipioActivo);
  actualizarNotaCuenta(usuario);

  // El personal territorial no cambia de municipio; el admin sí puede acotarse.
  const territorial = esEmpleado && usuario.rol !== 'admin';
  fijarSelectorMunicipio({
    bloqueado: territorial,
    motivo: territorial
      ? 'Tu ámbito territorial está asignado por el administrador'
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
  if (esPersonal(usuario)) {
    nota.style.display = 'none';
    return;
  }
  nota.style.display = 'block';
  nota.innerHTML =
    usuario.rol === 'ciudadano'
      ? `<i class="bi bi-bell-fill"></i> Recibirás avisos de tus reportes en el buzón (la campana). Estás como <strong>${esc(usuario.nombre)}</strong>.`
      : `<i class="bi bi-bell-slash"></i> Estás como <strong>anónimo</strong>: puedes reportar, pero no recibirás avisos. <a href="#" data-action="auth:mostrarLogin" data-valor="registro">Crea una cuenta</a> o <a href="#" data-action="auth:mostrarLogin" data-valor="login">inicia sesión</a> para seguir tus reportes.`;
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

/**
 * Botones para saltar a un municipio colindante con el activo.
 *
 * Se ocultan a quien no puede cambiar de municipio (el funcionario) y cuando el
 * municipio activo no tiene vecinos en el catálogo. Cada botón dispara la misma
 * acción que el buscador de la barra superior (`municipio:cambiar`), así que
 * cambiar de municipio desde aquí actualiza mapa, filtros, listado y estos
 * mismos botones.
 */
export function renderColindantes(colindantes = [], { visible = true } = {}) {
  const caja = $('colindantesBox');
  const lista = $('colindantesLista');
  if (!caja || !lista) return;

  if (!visible || !colindantes.length) {
    caja.style.display = 'none';
    lista.innerHTML = '';
    return;
  }

  caja.style.display = 'block';
  lista.innerHTML = colindantes
    .map(
      (m) => `
      <button type="button" class="chip-municipio" data-action="municipio:cambiar"
              data-valor="${esc(m.id)}" title="${esc(`${m.nombre}, ${m.estado}`)}">
        <span class="chip-nombre">${esc(m.nombre)}</span>
        <span class="chip-estado">${esc(m.estado)}</span>
      </button>`
    )
    .join('');
}

/** Credenciales de una cuenta ciudadana (nombre o pseudónimo + contraseña). */
export function valoresCiudadano() {
  return {
    nombre: ($('ciud-nombre')?.value || '').trim(),
    password: $('ciud-pass')?.value || ''
  };
}

/** Datos del alta de cuenta ciudadana. */
export function valoresRegistro() {
  return {
    correo: ($('reg-correo')?.value || '').trim(),
    password: $('reg-pass')?.value || '',
    nombre: ($('reg-nombre')?.value || '').trim(),
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
    'ciud-nombre',
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

/**
 * Abre o cierra el drawer lateral.
 *
 * Mantiene `aria-expanded`, muestra el backdrop en móvil, mueve el foco al
 * panel y lo devuelve al botón al cerrar. Sin esto el botón «funcionaba» pero
 * el panel quedaba debajo del mapa en pantallas pequeñas.
 */
let sidebarEscuchada = false;
function prepararSidebar() {
  if (sidebarEscuchada) return;
  sidebarEscuchada = true;
  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    const sidebar = $('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
      alternarSidebar(false);
    }
  });
}

export function alternarSidebar(abrir) {
  prepararSidebar();
  const sidebar = $('sidebar');
  const boton = $('btnSidebar');
  const backdrop = $('sidebarBackdrop');
  if (!sidebar) return false;

  const abierto =
    abrir === undefined ? sidebar.classList.contains('collapsed') : abrir === true;

  sidebar.classList.toggle('collapsed', !abierto);
  backdrop?.classList.toggle('show', abierto);
  boton?.setAttribute('aria-expanded', String(abierto));
  boton?.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');

  if (abierto) {
    sidebar.setAttribute('tabindex', '-1');
    sidebar.focus({ preventScroll: true });
  } else {
    boton?.focus({ preventScroll: true });
  }
  return abierto;
}

export function cerrarSidebar() {
  return alternarSidebar(false);
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
