/** Controlador de «Mi cuenta»: permisos actuales y solicitudes. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { esc, fmtFechaCorta } from '../core/utils.js';
import { sesion } from '../core/session.js';
import { permisosService } from '../services/permisos.service.js';
import { passwordService } from '../services/password.service.js';
import { bajaService } from '../services/baja.service.js';
import { altaService } from '../services/alta.service.js';
import { authService } from '../services/auth.service.js';
import { cuentaService } from '../services/cuenta.service.js';
import { PERMISOS_LISTA, ETIQUETAS_PERMISO } from '../views/admin.view.js';
import { mostrarLogin } from '../views/login.view.js';

function permisosActuales() {
  return sesion.usuario?.permisos || [];
}

/** Identificador visible de la cuenta en los formularios de confirmación. */
function identificadorCuenta() {
  const usuario = sesion.usuario;
  return usuario?.nombre || usuario?.correo || usuario?.username || '';
}

async function pintarSolicitudes() {
  const contenedor = document.getElementById('perfilSolicitudes');
  if (!contenedor) return;
  // La API de solicitudes de permisos exige personal. Para una cuenta
  // ciudadana o una sesión anónima no se llama: un 403 aquí abortaba la
  // apertura completa de «Mi cuenta».
  if (!sesion.esEmpleado()) {
    contenedor.innerHTML = '<p class="campo-nota">Las solicitudes de permisos son solo para cuentas del personal.</p>';
    return;
  }
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

/** Estado de la cuenta y, para el personal, de su clave de activación. */
async function pintarCuenta() {
  const contenedor = document.getElementById('perfilCuentaEstado');
  const cajaClave = document.getElementById('perfilClaveBox');
  const estadoClave = document.getElementById('perfilClaveEstado');
  if (!contenedor) return;
  const esStaff = sesion.esEmpleado();

  if (esStaff) {
    contenedor.innerHTML = '';
    try {
      const datos = await cuentaService.clave();
      const clave = datos.clave;
      const cuenta = datos.cuenta || {};
      const visible = Boolean(clave || cuenta.claveObligatoria || cuenta.claveId);
      cajaClave?.classList.toggle('u-oculto', !visible);
      if (!visible || !estadoClave) return;
      if (!clave) {
        estadoClave.innerHTML =
          '<p><span class="inc-badge badge-rojo">Sin clave</span> Tu cuenta no tiene una clave vinculada; pide a la administración que te asigne una.</p>';
        return;
      }
      const vencida =
        clave.expiraEn && new Date(clave.expiraEn).getTime() <= Date.now();
      const revocada = clave.activa === false;
      const badge = revocada || vencida ? 'rojo' : 'verde';
      const estado = revocada ? 'Revocada' : vencida ? 'Vencida' : 'Vigente';
      estadoClave.innerHTML = `
        <p><span class="inc-badge badge-${badge}">${estado}</span>
        ${clave.nombre ? ` Clave «${esc(clave.nombre)}».` : ''}</p>
        <p class="campo-nota">
          ${clave.expiraEn ? `Vence el ${fmtFechaCorta(clave.expiraEn)}.` : 'Sin fecha de vencimiento.'}
          ${clave.usosMaximos ? ` Cupo: ${clave.usos || 0}/${clave.usosMaximos}.` : ''}
          ${datos.renovacionPendiente ? '<br><strong>Renovación solicitada:</strong> espera la respuesta de la administración.' : ''}
        </p>`;
    } catch {
      cajaClave?.classList.add('u-oculto');
    }
    return;
  }

  cajaClave?.classList.add('u-oculto');
  if (sesion.usuario?.rol !== 'ciudadano') {
    contenedor.innerHTML = '';
    return;
  }
  try {
    const { cuenta } = await cuentaService.estado();
    const congelada = cuenta.suspendido === true;
    contenedor.innerHTML = congelada
      ? `<p><span class="inc-badge badge-amarillo">Congelada</span> ${
          cuenta.suspendidoHasta
            ? `hasta el ${fmtFechaCorta(cuenta.suspendidoHasta)}`
            : 'temporalmente'
        }</p>`
      : '<p><span class="inc-badge badge-verde">Activa</span> Puedes usar la aplicación con normalidad.</p>';
  } catch {
    contenedor.innerHTML = '<p class="campo-nota">No se pudo consultar el estado de la cuenta.</p>';
  }
}

function pintarFormulario() {
  const resumen = document.getElementById('perfilResumen');
  const actuales = permisosActuales();
  const esPersonal = sesion.esEmpleado();
  const esCiudadano = sesion.usuario?.rol === 'ciudadano';
  const esAnonimo = sesion.usuario?.rol === 'anonimo';

  // Los bloques de permisos y solicitudes son exclusivos del personal. Se
  // ocultan enteros (título, ayuda, campos y botón) para que una cuenta
  // ciudadana no vea acciones que el servidor rechazaría con 403.
  for (const id of [
    'perfilPermisosBox',
    'perfilSolicitudesBajaBox',
    'perfilSolicitudesAltaBox',
    'perfilSolicitudesBox'
  ]) {
    const caja = document.getElementById(id);
    if (!caja) continue;
    caja.classList.toggle('u-oculto', !esPersonal);
    caja.hidden = !esPersonal;
  }
  const anonimoBox = document.getElementById('perfilAnonimoBox');
  if (anonimoBox) {
    anonimoBox.classList.toggle('u-oculto', !esAnonimo);
    anonimoBox.hidden = !esAnonimo;
  }

  document.getElementById('perfilPasswordBox')?.classList.toggle('u-oculto', !esPersonal);
  document
    .getElementById('perfilCuentaBox')
    ?.classList.toggle('u-oculto', !esCiudadano);

  // El autoservicio de correo y contraseña es solo para cuentas ciudadanas;
  // el personal y la administración tienen sus propios flujos.
  for (const id of ['perfilCiudadanoBox', 'perfilCiudadanoPasswordBox']) {
    const caja = document.getElementById(id);
    if (!caja) continue;
    caja.classList.toggle('u-oculto', !esCiudadano);
    caja.hidden = !esCiudadano;
  }
  if (esCiudadano) {
    const correoActual = document.getElementById('perfilCorreoActual');
    if (correoActual) correoActual.textContent = sesion.usuario?.correo || '—';
    for (const id of ['perfilCorreoUsuario', 'perfilPasswordUsuario']) {
      const campo = document.getElementById(id);
      if (campo) campo.value = identificadorCuenta();
    }
    for (const id of [
      'perfilNuevoCorreo',
      'perfilCorreoPassword',
      'perfilPasswordActual',
      'perfilPasswordNueva',
      'perfilPasswordNueva2'
    ]) {
      const campo = document.getElementById(id);
      if (campo) campo.value = '';
    }
  }
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
        // Cada bloque consulta una API distinta. Un fallo opcional (por
        // ejemplo, una solicitud que el rol no puede ver) no debe impedir que
        // se abra el modal: se pintan los bloques que sí estén disponibles.
        await Promise.allSettled([
          pintarCuenta(),
          pintarSolicitudes(),
          pintarSolicitudesPassword(),
          pintarSolicitudesBaja(),
          pintarSolicitudesAlta()
        ]);
        abrirModal('modalPerfil', { nested: true });
      }),

    /** Desde «Mi cuenta» anónima se ofrece crear cuenta o iniciar sesión. */
    'perfil:irAlLogin': ({ valor }) => {
      cerrarModal('modalPerfil');
      mostrarLogin({
        puedeCancelar: true,
        modo: valor === 'registro' ? 'registro' : 'login'
      });
    },

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
      }),

    'perfil:cambiarCorreo': () =>
      intentar(async () => {
        if (sesion.usuario?.rol !== 'ciudadano') {
          return toast('Solo las cuentas ciudadanas pueden cambiar su correo desde aquí', 'err');
        }
        const correo = document.getElementById('perfilNuevoCorreo')?.value.trim() || '';
        const password = document.getElementById('perfilCorreoPassword')?.value || '';
        if (!correo) return toast('Escribe el correo nuevo', 'err');
        if (!password) return toast('Confirma tu contraseña actual', 'err');
        await cuentaService.cambiarCorreo({ correo, password });
        sesion.limpiar();
        toast('Revisa tu nuevo correo y confirma el enlace', 'ok');
        setTimeout(() => location.assign('/?cuenta=correo_pendiente'), 700);
      }),

    'perfil:cambiarPassword': () =>
      intentar(async () => {
        if (sesion.usuario?.rol !== 'ciudadano') {
          return toast('Solo las cuentas ciudadanas pueden cambiar su contraseña desde aquí', 'err');
        }
        const actual = document.getElementById('perfilPasswordActual')?.value || '';
        const nueva = document.getElementById('perfilPasswordNueva')?.value || '';
        const repetir = document.getElementById('perfilPasswordNueva2')?.value || '';
        if (!actual) return toast('Escribe tu contraseña actual', 'err');
        if (nueva.length < 8) {
          return toast('La contraseña debe tener al menos 8 caracteres', 'err');
        }
        if (nueva !== repetir) return toast('Las contraseñas nuevas no coinciden', 'err');
        await cuentaService.cambiarPassword({ passwordActual: actual, passwordNueva: nueva });
        sesion.limpiar();
        toast('Contraseña actualizada. Vuelve a entrar.', 'ok');
        setTimeout(() => location.assign('/?cuenta=recuperada'), 700);
      }),

    'cuenta:solicitarRenovacion': () =>
      intentar(async () => {
        if (!sesion.esEmpleado()) {
          return toast('Solo las cuentas del personal tienen clave de acceso', 'err');
        }
        const motivo = document.getElementById('perfilClaveMotivo')?.value || '';
        await cuentaService.solicitarRenovacion(motivo.trim());
        const campo = document.getElementById('perfilClaveMotivo');
        if (campo) campo.value = '';
        await pintarCuenta();
        toast('Solicitud de renovación enviada a la administración', 'ok');
      }),

    'cuenta:congelarAbrir': () => {
      if (sesion.usuario?.rol !== 'ciudadano') {
        return toast('Solo las cuentas ciudadanas pueden congelarse desde aquí', 'err');
      }
      const usuario = document.getElementById('congelarUsuario');
      const campo = document.getElementById('congelarPassword');
      if (usuario) usuario.value = identificadorCuenta();
      if (campo) campo.value = '';
      abrirModal('modalCongelarCuenta', { nested: true });
    },

    'cuenta:eliminarAbrir': () => {
      if (sesion.usuario?.rol !== 'ciudadano') {
        return toast('Solo las cuentas ciudadanas pueden eliminarse desde aquí', 'err');
      }
      const usuario = document.getElementById('eliminarUsuario');
      const password = document.getElementById('eliminarPassword');
      const confirmacion = document.getElementById('eliminarConfirmacion');
      const nota = document.getElementById('eliminarNombreNota');
      if (usuario) usuario.value = identificadorCuenta();
      if (password) password.value = '';
      if (confirmacion) confirmacion.value = '';
      if (nota) {
        nota.textContent = `Tu nombre actual es «${sesion.usuario?.nombre || ''}». Escríbelo tal cual para confirmar.`;
      }
      abrirModal('modalEliminarCuenta', { nested: true });
    },

    'cuenta:congelar': () =>
      intentar(async () => {
        const dias = Number(document.getElementById('congelarDias')?.value || 0);
        const password = document.getElementById('congelarPassword')?.value || '';
        if (![7, 30, 90].includes(dias)) return toast('Elige un plazo válido', 'err');
        if (!password) return toast('Confirma tu contraseña', 'err');
        const resultado = await cuentaService.congelar({ dias, password });
        sesion.limpiar();
        toast(`Cuenta congelada hasta el ${fmtFechaCorta(resultado.hasta)}`, 'ok');
        setTimeout(() => location.assign('/?cuenta=congelada'), 600);
      }),

    'cuenta:eliminar': () =>
      intentar(async () => {
        const password = document.getElementById('eliminarPassword')?.value || '';
        const confirmacion = document.getElementById('eliminarConfirmacion')?.value || '';
        if (!password) return toast('Confirma tu contraseña', 'err');
        if (!confirmacion.trim()) return toast('Escribe tu nombre para confirmar', 'err');
        await cuentaService.eliminar({ password, confirmacion });
        sesion.limpiar();
        toast('Tu cuenta fue eliminada', 'ok');
        setTimeout(() => location.assign('/?cuenta=eliminada'), 600);
      })
  });
}
