/**
 * Vista del modal «Mi cuenta».
 *
 * Reúne lo que el ciudadano puede hacer con su propia cuenta: cambiar la
 * contraseña, pedir otro enlace de confirmación, descargar sus datos y darse de
 * baja. El modal se prepara cada vez que se abre, porque el aviso del correo
 * sin confirmar depende de la sesión y cambia sin recargar la página.
 */
import { $, esc } from '../core/utils.js';

/** Rellena el encabezado del modal con los datos de la sesión. */
export function preparar(usuario) {
  const resumen = $('cuentaResumen');
  if (resumen && usuario) {
    const rol = usuario.rol === 'ciudadano' ? 'Cuenta ciudadana' : 'Cuenta del personal';
    resumen.innerHTML = `${rol} · <strong>${esc(usuario.nombre)}</strong>${
      usuario.correo ? ` · ${esc(usuario.correo)}` : ''
    }`;
  }

  // El aviso solo tiene sentido para una cuenta ciudadana sin confirmar.
  const aviso = $('cuentaAvisoCorreo');
  const pendiente = usuario?.rol === 'ciudadano' && usuario.correoVerificado === false;
  if (aviso) aviso.classList.toggle('u-oculto', !pendiente);

  // La baja es cosa de cuentas ciudadanas: las del personal las gestiona un
  // administrador (el servidor lo rechaza igualmente).
  const baja = $('cuentaBajaBox');
  if (baja) baja.classList.toggle('u-oculto', usuario?.rol !== 'ciudadano');
}

/** Campos del formulario de cambio de contraseña. */
export function valoresPassword() {
  return {
    actual: $('cuenta-actual')?.value || '',
    nueva: $('cuenta-nueva')?.value || '',
    nueva2: $('cuenta-nueva2')?.value || ''
  };
}

/** Campos del formulario de baja. */
export function valoresBaja() {
  return {
    password: $('cuenta-baja-pass')?.value || '',
    confirmado: $('cuenta-baja-ok')?.checked === true
  };
}

/** Deja los formularios en blanco (al cerrar el modal o tras cada acción). */
export function limpiarFormularios() {
  ['cuenta-actual', 'cuenta-nueva', 'cuenta-nueva2', 'cuenta-baja-pass'].forEach((id) => {
    const campo = $(id);
    if (campo) campo.value = '';
  });
  const casilla = $('cuenta-baja-ok');
  if (casilla) casilla.checked = false;
}
