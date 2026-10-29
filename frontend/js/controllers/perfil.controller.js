/** Controlador de «Mi cuenta»: permisos actuales y solicitudes. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { esc, fmtFechaCorta } from '../core/utils.js';
import { sesion } from '../core/session.js';
import { permisosService } from '../services/permisos.service.js';
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

function pintarFormulario() {
  const resumen = document.getElementById('perfilResumen');
  const actuales = permisosActuales();
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
  const esPersonal = sesion.esEmpleado();
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
      })
  });
}
