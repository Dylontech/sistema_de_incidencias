/** Vista de login y del armazón de la aplicación. */
import { $, esc } from '../core/utils.js';
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

/**
 * Sub-pasos del panel «Ciudadano»: elegir, entrar con cuenta, registrarse,
 * pedir el enlace de recuperación, elegir contraseña nueva y el aviso de
 * «revisa tu correo» tras el alta.
 * Es la única vía de acceso de esta pantalla: el acceso del personal vive en
 * `/personal` (ver `js/personal.js`), una página sin enlaces.
 */
const PASOS_ANON = {
  inicio: 'anonInicio',
  login: 'anonLogin',
  registro: 'anonRegistro',
  olvide: 'anonOlvide',
  restablecer: 'anonRestablecer',
  verificacion: 'anonVerificacion'
};

export function mostrarModoAnon(modo = 'inicio') {
  const elegido = PASOS_ANON[modo] ? modo : 'inicio';
  Object.entries(PASOS_ANON).forEach(([nombre, id]) => {
    const elemento = $(id);
    if (elemento) elemento.style.display = nombre === elegido ? 'block' : 'none';
  });
  if (elegido === 'registro') alternarPseudonimo(false);
  const focos = {
    login: 'ciud-correo',
    registro: 'reg-correo',
    olvide: 'olvide-correo',
    restablecer: 'rest-pass'
  };
  if (focos[elegido]) $(focos[elegido])?.focus();
}

/** Pantalla que se ve tras el alta: hay que abrir el enlace del correo. */
export function mostrarAvisoDeVerificacion(correo, { puedeCancelar = false } = {}) {
  const destino = $('verif-correo');
  if (destino) destino.textContent = correo || 'tu dirección';
  mostrarLogin({ puedeCancelar });
  mostrarModoAnon('verificacion');
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
 * Abre la pantalla de acceso ciudadano sin perder la sesión anónima que ya está
 * activa. Si hay sesión, se muestra la «×» para volver a la aplicación.
 */
export function mostrarLogin({ puedeCancelar = false } = {}) {
  $('loginScreen').style.display = 'flex';
  const cancelar = $('loginCancelBtn');
  if (cancelar) cancelar.style.display = puedeCancelar ? 'block' : 'none';
  mostrarModoAnon('inicio');
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
  // Cualquier cuenta (ciudadana o del personal) puede cerrar sesión.
  const tieneCuenta = usuario.rol !== 'anonimo';
  $('btn-admin').style.display = esEmpleado ? 'inline-flex' : 'none';
  $('btn-informes').style.display = esEmpleado ? 'inline-flex' : 'none';
  $('btn-logout').style.display = tieneCuenta ? 'inline-flex' : 'none';
  // «Mi cuenta» solo tiene sentido con cuenta: contraseña, datos y baja.
  const btnCuenta = $('btn-cuenta');
  if (btnCuenta) btnCuenta.style.display = tieneCuenta ? 'inline-flex' : 'none';
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
  if (usuario.rol !== 'ciudadano') {
    nota.innerHTML = `<i class="bi bi-bell-slash"></i> Estás como <strong>anónimo</strong>: puedes reportar, pero no recibirás avisos. <a href="#" data-action="auth:mostrarLogin" data-valor="anon">Crea una cuenta</a> para seguir tus reportes.`;
    return;
  }
  // Con cuenta y el correo sin confirmar se avisa aquí, que es donde el
  // ciudadano mira si va a recibir avisos.
  nota.innerHTML =
    usuario.correoVerificado === false
      ? `<i class="bi bi-envelope-exclamation-fill"></i> Confirma tu correo para poder entrar desde otros dispositivos y no perder el acceso. <a href="#" data-action="cuenta:abrir" data-valor="verificacion">Confirmar ahora</a>.`
      : `<i class="bi bi-bell-fill"></i> Recibirás avisos de tus reportes en el buzón (la campana). Estás como <strong>${esc(usuario.nombre)}</strong>.`;
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

/** Credenciales de una cuenta ciudadana (se entra con el correo). */
export function valoresCiudadano() {
  return {
    correo: $('ciud-correo').value.trim(),
    password: $('ciud-pass').value
  };
}

/** Correo al que se manda el enlace de recuperación. */
export function valoresOlvide() {
  return { correo: $('olvide-correo').value.trim() };
}

/** Contraseña nueva elegida desde el enlace del correo. */
export function valoresRestablecer() {
  return {
    password: $('rest-pass').value,
    password2: $('rest-pass2').value
  };
}

/**
 * Deja escrito el correo en la pantalla de acceso.
 * Se usa al volver del enlace de confirmación: el ciudadano solo tiene que
 * escribir su contraseña.
 */
export function rellenarCorreoInicioDeSesion(correo) {
  const campo = $('ciud-correo');
  if (campo && correo) campo.value = correo;
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
    'reg-nombre',
    'olvide-correo',
    'rest-pass',
    'rest-pass2'
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
