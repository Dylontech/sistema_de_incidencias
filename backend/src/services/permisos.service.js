/** Permisos efectivos: matriz del rol + excepciones de la cuenta. */
import {
  PERMISOS,
  PERMISOS_POR_ROL,
  PERMISOS_UMBRELLA
} from '../config/constantes.js';
import { AppError } from '../utils/AppError.js';

export { PERMISOS, PERMISOS_POR_ROL, PERMISOS_UMBRELLA };

/** Expande los permisos paraguas (`gestionar_usuarios` → CRUD concreto). */
export function expandirPermisos(lista = []) {
  const conjunto = new Set();
  for (const permiso of lista) {
    if (!PERMISOS.includes(permiso)) continue;
    conjunto.add(permiso);
    for (const hijo of PERMISOS_UMBRELLA[permiso] || []) conjunto.add(hijo);
  }
  return [...conjunto];
}

/** Lista de permisos efectivos de una cuenta (o del contexto de sesión). */
export function permisosDe(cuenta = {}) {
  // El contexto de sesión ya trae la lista efectiva; no hay que recalcularla
  // (perdería los permisos aprobados, los del rol especial o el recorte de una
  // clave de acceso).
  if (Array.isArray(cuenta.permisos)) return [...new Set(cuenta.permisos)];
  // V2.11: la matriz del rol integrado vive en la tabla `roles` y llega como
  // `rolConfig`. Si la cuenta no la trae (o el rol no está en la tabla) se usa
  // la constante como valor de fábrica. Un rol propio SUSTITUYE la matriz de
  // su plantilla: es el rol que el administrador definió, no una suma.
  const configurada = Array.isArray(cuenta.rolConfig?.permisos)
    ? cuenta.rolConfig.permisos
    : null;
  const propios = Array.isArray(cuenta.rolPropio?.permisos)
    ? cuenta.rolPropio.permisos
    : null;
  const base = propios || configurada || PERMISOS_POR_ROL[cuenta.rol] || [];
  const conjunto = new Set(base);
  // Rol especial: sus permisos se suman a los del rol base y después se
  // aplican las excepciones de la cuenta (los overrides mandan).
  const extras = Array.isArray(cuenta.rolPersonalizado?.permisos)
    ? cuenta.rolPersonalizado.permisos
    : [];
  for (const permiso of extras) {
    if (PERMISOS.includes(permiso)) conjunto.add(permiso);
  }
  // Los paraguas heredados se expanden antes de aplicar excepciones.
  const expandido = new Set(expandirPermisos([...conjunto]));
  const overrides = cuenta.permisos && typeof cuenta.permisos === 'object' ? cuenta.permisos : {};

  // 1) Un paraguas denegado quita todo su bloque. 2) Las concesiones suman.
  // 3) Las denegaciones concretas mandan al final. Así «gestionar_usuarios:
  // false» + «ver_usuarios: true» deja solo la consulta.
  for (const [permiso, valor] of Object.entries(overrides)) {
    if (valor !== false || !PERMISOS_UMBRELLA[permiso]) continue;
    expandido.delete(permiso);
    for (const hijo of PERMISOS_UMBRELLA[permiso]) expandido.delete(hijo);
  }
  for (const [permiso, valor] of Object.entries(overrides)) {
    if (valor !== true) continue;
    expandido.add(permiso);
    for (const hijo of PERMISOS_UMBRELLA[permiso] || []) expandido.add(hijo);
  }
  for (const [permiso, valor] of Object.entries(overrides)) {
    if (valor !== false || PERMISOS_UMBRELLA[permiso]) continue;
    expandido.delete(permiso);
  }
  return [...expandido];
}

export function tienePermiso(usuario, permiso) {
  if (!usuario) return false;
  if (usuario.rol === 'admin') return true;
  const lista = Array.isArray(usuario.permisos) ? usuario.permisos : permisosDe(usuario);
  return lista.includes(permiso);
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

/**
 * Normaliza una lista de permisos (la usan las claves de acceso).
 * Acepta un arreglo o un mapa `{ permiso: true }` y expande los paraguas.
 */
export function normalizarListaPermisos(datos) {
  if (datos === undefined || datos === null) return undefined;
  let lista;
  if (Array.isArray(datos)) {
    lista = datos;
  } else if (datos && typeof datos === 'object') {
    lista = Object.entries(datos)
      .filter(([, valor]) => valor === true)
      .map(([permiso]) => permiso);
  } else {
    throw AppError.solicitudInvalida('Los permisos deben ser una lista');
  }
  return expandirPermisos(lista);
}

/** Permisos base del rol ya expandidos (sin excepciones de la cuenta). */
export function permisosBaseDeRol(rol) {
  return expandirPermisos(PERMISOS_POR_ROL[rol] || []);
}

/**
 * Convierte una lista de permisos permitidos en el mapa de excepciones que se
 * guarda en `usuarios.permisos`. Sirve para que una cuenta creada desde una
 * clave nazca con exactamente los permisos que la clave concede.
 */
export function overridesDesdeLista(lista = []) {
  const permitidos = new Set(normalizarListaPermisos(lista) || []);
  const salida = {};
  for (const permiso of PERMISOS) salida[permiso] = permitidos.has(permiso);
  return salida;
}

/** Recorta una lista de permisos efectivos a los que permite una clave. */
export function intersectarPermisos(base = [], permitidos = null) {
  const limpios = [...new Set(base)];
  if (!Array.isArray(permitidos)) return limpios;
  const conjunto = new Set(expandirPermisos(permitidos));
  return limpios.filter((permiso) => conjunto.has(permiso));
}

/**
 * Permisos que un actor puede conceder a otra cuenta.
 *
 * El administrador maestro no tiene límite (`null`). El resto solo puede
 * otorgar lo que ya tiene: así un funcionario con `editar_usuarios` no puede
 * regalarse `crear_claves`, `ver_auditoria` ni administración.
 */
export function permisosOtorgables(actor) {
  if (!actor) return new Set();
  if (actor.rol === 'admin') return null;
  return new Set(permisosDe(actor));
}

/** ¿Puede el actor conceder todos estos permisos? */
export function puedeOtorgar(actor, permisos = []) {
  const limite = permisosOtorgables(actor);
  if (limite === null) return true;
  return expandirPermisos(permisos).every((permiso) => limite.has(permiso));
}

/** Lista de permisos concedidos de más (para el mensaje de error). */
export function permisosFueraDeAlcance(actor, permisos = []) {
  const limite = permisosOtorgables(actor);
  if (limite === null) return [];
  return expandirPermisos(permisos).filter((permiso) => !limite.has(permiso));
}
