/** Permisos efectivos: matriz del rol + excepciones de la cuenta. */
import { PERMISOS, PERMISOS_POR_ROL } from '../config/constantes.js';
import { AppError } from '../utils/AppError.js';

export { PERMISOS, PERMISOS_POR_ROL };

/** Lista de permisos efectivos de una cuenta (o del contexto de sesión). */
export function permisosDe(cuenta = {}) {
  // El contexto de sesión ya trae la lista efectiva; no hay que recalcularla
  // (perdería los permisos aprobados o los del rol especial).
  if (Array.isArray(cuenta.permisos)) return [...new Set(cuenta.permisos)];
  const base = PERMISOS_POR_ROL[cuenta.rol] || [];
  const conjunto = new Set(base);
  // Rol especial: sus permisos se suman a los del rol base y después se
  // aplican las excepciones de la cuenta (los overrides mandan).
  const extras = Array.isArray(cuenta.rolPersonalizado?.permisos)
    ? cuenta.rolPersonalizado.permisos
    : [];
  for (const permiso of extras) {
    if (PERMISOS.includes(permiso)) conjunto.add(permiso);
  }
  const overrides = cuenta.permisos && typeof cuenta.permisos === 'object' ? cuenta.permisos : {};

  for (const permiso of PERMISOS) {
    if (overrides[permiso] === true) conjunto.add(permiso);
    if (overrides[permiso] === false) conjunto.delete(permiso);
  }
  return [...conjunto];
}

export function tienePermiso(usuario, permiso) {
  if (!usuario) return false;
  if (usuario.rol === 'admin') return true;
  return (usuario.permisos || permisosDe(usuario)).includes(permiso);
}

/** Normaliza el mapa que llega del panel: solo permisos conocidos y booleanos. */
export function normalizarPermisos(datos) {
  if (datos === undefined) return undefined;
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw AppError.solicitudInvalida('Los permisos deben ser un objeto');
  }
  const salida = {};
  for (const [permiso, valor] of Object.entries(datos)) {
    if (!PERMISOS.includes(permiso)) continue;
    salida[permiso] = valor === true;
  }
  return salida;
}
