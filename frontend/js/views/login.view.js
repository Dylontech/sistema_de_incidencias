/** Vista de login y del armazón de la aplicación. */
import { $, $$ } from '../core/utils.js';

export function mostrarPanel(nombre) {
  $$('.login-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.valor === nombre));
  $$('.login-panel').forEach((panel) => panel.classList.remove('active'));
  $(`panel-${nombre}`)?.classList.add('active');
}

export function mostrarLogin() {
  $('loginScreen').style.display = 'flex';
  $('app').classList.remove('active');
}

/** Oculta el login y prepara la interfaz según el rol (paridad con Auth.iniciarApp). */
export function mostrarApp({ usuario, municipioActivo }) {
  $('loginScreen').style.display = 'none';
  $('app').classList.add('active');

  const esEmpleado = usuario.rol === 'funcionario' || usuario.rol === 'admin';
  $('btn-admin').style.display = esEmpleado ? 'inline-flex' : 'none';
  $('btn-informes').style.display = esEmpleado ? 'inline-flex' : 'none';
  $('visibilidadNota').style.display = esEmpleado ? 'none' : 'block';

  $('userName').textContent = usuario.nombre;
  actualizarMunicipioTitulo(municipioActivo);
}

export function actualizarMunicipioTitulo(municipio) {
  const elemento = $('topbar-muni');
  if (!elemento) return;
  elemento.textContent = municipio ? `${municipio.nombre}, ${municipio.estado}` : '—';
  $('loginSubtitulo').textContent = municipio
    ? `Municipio de ${municipio.nombre}, ${municipio.estado}`
    : 'Sistema de Incidencias Municipales';
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
