/** Vista de login y del armazón de la aplicación. */
import { $, $$, esc } from '../core/utils.js';

export function mostrarPanel(nombre) {
  $$('.login-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.valor === nombre));
  $$('.login-panel').forEach((panel) => panel.classList.remove('active'));
  $(`panel-${nombre}`)?.classList.add('active');
}

/**
 * Abre la pantalla de acceso del personal (funcionario/administrador) sin
 * perder la sesión ciudadana que ya está activa. Si hay sesión, se muestra la
 * «×» para volver a la aplicación. Mismo comportamiento que `Auth.mostrarLogin`.
 */
export function mostrarLogin({ puedeCancelar = false } = {}) {
  $('loginScreen').style.display = 'flex';
  const cancelar = $('loginCancelBtn');
  if (cancelar) cancelar.style.display = puedeCancelar ? 'block' : 'none';
  // El acceso del personal empieza en la pestaña de funcionario.
  mostrarPanel('func');
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
  $('btn-admin').style.display = esEmpleado ? 'inline-flex' : 'none';
  $('btn-informes').style.display = esEmpleado ? 'inline-flex' : 'none';
  // El ciudadano ve el botón para acceder como personal; el personal, el de salir.
  $('btn-staff-login').style.display = esEmpleado ? 'none' : 'inline-flex';
  $('btn-logout').style.display = esEmpleado ? 'inline-flex' : 'none';
  $('visibilidadNota').style.display = esEmpleado ? 'none' : 'block';

  $('userName').textContent = usuario.nombre;
  actualizarMunicipioTitulo(municipioActivo);

  // El funcionario está atado a su municipio: el selector se queda fijo.
  fijarSelectorMunicipio({
    bloqueado: usuario.rol === 'funcionario',
    motivo:
      usuario.rol === 'funcionario'
        ? 'Tu municipio asignado no se puede cambiar'
        : 'Municipio activo (catálogo del INEGI)'
  });
}

export function actualizarMunicipioTitulo(municipio) {
  const elemento = $('topbar-muni');
  if (elemento) elemento.textContent = municipio ? `${municipio.nombre}, ${municipio.estado}` : '—';

  const selector = $('municipioActivoSelect');
  if (selector && municipio) selector.value = municipio.id;

  $('loginSubtitulo').textContent = municipio
    ? `Municipio de ${municipio.nombre}, ${municipio.estado}`
    : 'Sistema de Incidencias Municipales';
}

/**
 * Rellena el selector de municipio de la barra superior.
 *
 * El listado del catálogo llega sin polígonos y ordenado por nombre, así que
 * el selector se puede usar con los 113 municipios del estado sin traer
 * megabytes de contornos. Un funcionario ve su municipio y no puede cambiarlo
 * (el servidor ignora cualquier otro: su alcance no se decide en el navegador).
 */
export function renderMunicipios(municipios = [], activoId = null) {
  const selector = $('municipioActivoSelect');
  if (!selector) return;

  const opciones = municipios
    .map((m) => `<option value="${esc(m.id)}">${esc(m.nombre)}</option>`)
    .join('');
  selector.innerHTML = opciones || '<option value="">Sin municipios</option>';
  if (activoId) selector.value = activoId;
}

/** Bloquea el selector para quien no puede cambiar de municipio. */
export function fijarSelectorMunicipio({ bloqueado = false, motivo = '' } = {}) {
  const selector = $('municipioActivoSelect');
  if (!selector) return;
  selector.disabled = bloqueado;
  selector.title = motivo || 'Municipio activo';
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

export function limpiarFormularios() {
  ['func-user', 'func-pass', 'func-code', 'admin-user', 'admin-pass'].forEach((id) => {
    const campo = $(id);
    if (campo) campo.value = '';
  });
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
