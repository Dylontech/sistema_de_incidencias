/** Controlador de «Mi cuenta»: permisos actuales y solicitudes. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { esc, fmtFechaCorta } from '../core/utils.js';
import { sesion } from '../core/session.js';
import { permisosService } from '../services/permisos.service.js';
import { passwordService } from '../services/password.service.js';
import { bajaService } from '../services/baja.service.js';
import { altaService } from '../services/alta.service.js';
import { authService } from '../services/auth.service.js';
import { PERMISOS_LISTA, ETIQUETAS_PERMISO } from '../views/admin.view.js';

function permisosActuales() {
  return sesion.usuario?.permisos || [];
}

async function pintarSolicitudes() {
  const contenedor = document.getElementById('perfilSolicitudes');
  if (!contenedor) return;
  const { solicitudes } = await permisosService.mias();
  if (!solicitudes.length) {
    contenedor.innerHTML = '<p class="campo-nota">Todavía no has solicitado permisos.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Permisos</th><th>Motivo</th><th>Estado</th><th>Fecha</th></tr></thead>
        <tbody>
          ${solicitudes
            .map(
              (s) => `<tr>
                <td class="u-fs-11px">${esc((s.permisos || []).join(', '))}</td>
                <td class="u-fs-11px">${esc(s.motivo)}${s.respuesta ? `<div class="campo-nota">${esc(s.respuesta)}</div>` : ''}</td>
                <td><span class="inc-badge badge-${s.estado === 'aprobada' ? 'verde' : s.estado === 'rechazada' ? 'rojo' : 'amarillo'}">${esc(s.estado)}</span></td>
                <td class="u-fs-11px">${fmtFechaCorta(s.creadoEn)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Estado de las solicitudes de cambio de contraseña. */
async function pintarSolicitudesPassword() {
  const contenedor = document.getElementById('perfilSolicitudesPassword');
  if (!contenedor) return;
  if (!sesion.esEmpleado()) {
    contenedor.innerHTML = '';
    return;
  }
  let solicitudes = [];
  try {
    ({ solicitudes } = await passwordService.mias());
  } catch {
    contenedor.innerHTML = '<p class="campo-nota">No se pudieron cargar las solicitudes.</p>';
    return;
  }
  if (!solicitudes.length) {
    contenedor.innerHTML = '<p class="campo-nota">Sin solicitudes de contraseña.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Cuenta</th><th>Motivo</th><th>Estado</th><th>Fecha</th></tr></thead>
        <tbody>
          ${solicitudes
            .map(
              (s) => `<tr>
                <td>${esc(s.nombre || s.username)}${
                  s.solicitadoPor && s.solicitadoPor !== s.username
                    ? '<div class="campo-nota">La pediste tú</div>'
                    : ''
                }</td>
                <td>${esc(s.motivo)}${
                  s.respuesta ? `<div class="campo-nota">Respuesta: ${esc(s.respuesta)}</div>` : ''
                }${
                  s.estado === 'resuelta'
                    ? '<div class="campo-nota">La contraseña nueva llegó a tu campana de avisos.</div>'
                    : ''
                }</td>
                <td><span class="inc-badge badge-${
                  s.estado === 'resuelta' ? 'verde' : s.estado === 'rechazada' ? 'rojo' : 'amarillo'
                }">${esc(s.estado)}</span></td>
                <td>${fmtFechaCorta(s.creadoEn)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Estado de las solicitudes de baja que hizo o recibió el actor. */
async function pintarSolicitudesBaja() {
  const contenedor = document.getElementById('perfilSolicitudesBaja');
  if (!contenedor) return;
  if (!sesion.esEmpleado()) {
    contenedor.innerHTML = '';
    return;
  }
  let solicitudes = [];
  try {
    ({ solicitudes } = await bajaService.mias());
  } catch {
    contenedor.innerHTML = '<p class="campo-nota">No se pudieron cargar las solicitudes.</p>';
    return;
  }
  if (!solicitudes.length) {
    contenedor.innerHTML = '<p class="campo-nota">Sin solicitudes de baja.</p>';
    return;
  }
  const propio = String(sesion.usuario?.id || '');
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Cuenta</th><th>Motivo</th><th>Estado</th><th>Fecha</th></tr></thead>
        <tbody>
          ${solicitudes
            .map(
              (s) => `<tr>
                <td>${esc(s.nombre || s.username)}${
                  String(s.usuarioId) !== propio
                    ? '<div class="campo-nota">La pediste tú</div>'
                    : ''
                }</td>
                <td>${esc(s.motivo)}${
                  s.respuesta ? `<div class="campo-nota">Respuesta: ${esc(s.respuesta)}</div>` : ''
                }</td>
                <td><span class="inc-badge badge-${
                  s.estado === 'aprobada' ? 'verde' : s.estado === 'rechazada' ? 'rojo' : 'amarillo'
                }">${esc(s.estado)}</span></td>
                <td>${fmtFechaCorta(s.creadoEn)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Estado de las solicitudes de alta que pidió el actor. */
async function pintarSolicitudesAlta() {
  const contenedor = document.getElementById('perfilSolicitudesAlta');
  if (!contenedor) return;
  if (!sesion.esEmpleado()) {
    contenedor.innerHTML = '';
    return;
  }
  let solicitudes = [];
  try {
    ({ solicitudes } = await altaService.mias());
  } catch {
    contenedor.innerHTML = '<p class="campo-nota">No se pudieron cargar las solicitudes.</p>';
    return;
  }
  if (!solicitudes.length) {
    contenedor.innerHTML = '<p class="campo-nota">Sin solicitudes de alta.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Cuenta</th><th>Contacto</th><th>Estado</th><th>Fecha</th></tr></thead>
        <tbody>
          ${solicitudes
            .map(
              (s) => `<tr>
                <td><strong>${esc(s.nombre)}</strong><div class="campo-nota">${esc(s.username)}</div></td>
                <td>${esc(s.correo || '—')}${
                  s.telefono ? `<div class="campo-nota">${esc(s.telefono)}</div>` : ''
                }</td>
                <td><span class="inc-badge badge-${
                  s.estado === 'aprobada' ? 'verde' : s.estado === 'rechazada' ? 'rojo' : 'amarillo'
                }">${esc(s.estado)}</span>${
                  s.estado === 'aprobada'
                    ? '<div class="campo-nota">La contraseña temporal llegó a tu campana.</div>'
                    : ''
                }</td>
                <td>${fmtFechaCorta(s.creadoEn)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function pintarFormulario() {
  const resumen = document.getElementById('perfilResumen');
  const actuales = permisosActuales();
  const esPersonal = sesion.esEmpleado();
  document.getElementById('perfilPasswordBox')?.classList.toggle('u-oculto', !esPersonal);
  if (resumen) {
    const usuario = sesion.usuario || {};
    const acceso =
      usuario.rol === 'ciudadano'
        ? `<p class="campo-nota">Nombre de acceso: <strong>${esc(
            usuario.nombre || '—'
          )}</strong>${usuario.correo ? ` · Correo para avisos: ${esc(usuario.correo)}` : ''}</p>`
        : '';
    resumen.innerHTML = `
      <p><strong>${esc(usuario.nombre || usuario.username || '—')}</strong></p>
      <p class="campo-nota">Rol: ${esc(usuario.rol || '—')} · Permisos actuales: ${
        actuales.length
          ? actuales.map((p) => esc(ETIQUETAS_PERMISO[p] || p)).join(', ')
          : 'ninguno'
      }</p>${acceso}`;
  }
  const contenedor = document.getElementById('perfilPermisos');
  if (!contenedor) return;
  if (!esPersonal) {
    contenedor.innerHTML =
      '<p class="campo-nota">Las solicitudes de permisos son solo para cuentas del personal.</p>';
    return;
  }
  const faltantes = PERMISOS_LISTA.filter((p) => !actuales.includes(p));
  contenedor.innerHTML = faltantes.length
    ? faltantes
        .map(
          (permiso) =>
            `<label class="check-line"><input type="checkbox" data-permiso="${permiso}"><span>${esc(
              ETIQUETAS_PERMISO[permiso]
            )}</span></label>`
        )
        .join('')
    : '<p class="campo-nota">Ya tienes todos los permisos disponibles. Si necesitas otro alcance, abre un ticket de soporte.</p>';
}

export function registrar() {
  registrarAcciones({
    'perfil:abrir': () =>
      intentar(async () => {
        // Recupera los permisos efectivos actuales: una aprobación reciente se
        // refleja sin que la persona tenga que cerrar sesión.
        try {
          const actual = await authService.yo();
          if (actual?.usuario) sesion.actualizarUsuario(actual.usuario);
        } catch {
          // Sin conexión se mantiene la sesión local.
        }
        pintarFormulario();
        await pintarSolicitudes();
        await pintarSolicitudesPassword();
        await pintarSolicitudesBaja();
        await pintarSolicitudesAlta();
        abrirModal('modalPerfil', { nested: true });
      }),

    'perfil:solicitar': () =>
      intentar(async () => {
        const permisos = [...document.querySelectorAll('#perfilPermisos input[data-permiso]')]
          .filter((c) => c.checked)
          .map((c) => c.dataset.permiso);
        const motivo = document.getElementById('perfilMotivo')?.value || '';
        if (!permisos.length) return toast('Marca al menos un permiso', 'err');
        await permisosService.crear({ permisos, motivo });
        document.getElementById('perfilMotivo').value = '';
        await pintarSolicitudes();
        toast('Solicitud enviada al administrador', 'ok');
      }),

    'perfil:solicitarPassword': () =>
      intentar(async () => {
        const motivo = document.getElementById('perfilMotivoPassword')?.value || '';
        if (motivo.trim().length < 10) {
          return toast('Explica en al menos 10 caracteres por qué necesitas el cambio', 'err');
        }
        await passwordService.crear({ motivo });
        document.getElementById('perfilMotivoPassword').value = '';
        await pintarSolicitudesPassword();
        toast('Solicitud de contraseña enviada al administrador', 'ok');
      })
  });
}
