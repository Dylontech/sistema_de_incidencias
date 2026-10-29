/**
 * Roles y capacidades del frontend.
 *
 * Es una copia de presentación de la matriz del servidor: sirve para decidir
 * qué enlaces y vistas se muestran, nunca para autorizar. La autorización real
 * vive en los middlewares y servicios del backend.
 */

export const ROLES_PERSONAL = [
  'funcionario',
  'auditor',
  'enlace_estatal',
  'enlace_federal',
  'soporte',
  'admin_municipal',
  'admin_estatal',
  'admin'
];

export const ROLES_ADMIN = ['admin', 'admin_estatal', 'admin_municipal'];

/** Roles que pueden abrir la cola del panel de soporte técnico. */
export const ROLES_ATENCION = ['soporte', 'admin_municipal', 'admin_estatal', 'admin'];

export function esPersonal(usuario) {
  return Boolean(usuario?.esPersonal === true || ROLES_PERSONAL.includes(usuario?.rol));
}

export function esAlgunaAdmin(usuario) {
  return ROLES_ADMIN.includes(usuario?.rol);
}

/**
 * ¿Puede abrir el panel de soporte?
 *
 * El login nuevo trae `puedeAtenderTickets` calculado en el servidor. El
 * fallback por rol/permisos mantiene compatibles las sesiones guardadas antes
 * de este cambio.
 */
export function puedeAtenderTickets(usuario) {
  if (usuario?.puedeAtenderTickets === true) return true;
  if (!esPersonal(usuario)) return false;
  if (usuario.rol === 'admin') return true;
  return Array.isArray(usuario.permisos) && usuario.permisos.includes('atender_tickets');
}

/** Permisos efectivos de una cuenta, vengan como lista o como overrides. */
export function permisosDeUsuario(usuario) {
  return Array.isArray(usuario?.permisos) ? usuario.permisos : [];
}
