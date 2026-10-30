/**
 * SERVICIO: roles especiales.
 *
 * Un rol especial no sustituye al rol del sistema (el enum de `usuarios.rol`):
 * suma permisos a la cuenta que lo tiene asignado. Así un funcionario puede
 * recibir, por ejemplo, `gestionar_usuarios` sin convertirse en administrador
 * global; su alcance territorial sigue siendo el de sus asignaciones.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { PERMISOS, PERMISOS_POR_ROL, ROLES_PERSONAL } from '../config/constantes.js';
import { esAdminMaestro } from './alcance.service.js';
import { expandirPermisos, normalizarPermisos } from './permisos.service.js';

function exigirMaestro(actor) {
  if (!esAdminMaestro(actor)) {
    throw AppError.prohibido('Solo el administrador maestro puede gestionar roles especiales');
  }
}

function validar(datos = {}, { parcial = false } = {}) {
  const salida = {};
  if (!parcial || datos.nombre !== undefined) {
    const nombre = String(datos.nombre || '').trim();
    if (!nombre) throw AppError.solicitudInvalida('Escribe un nombre para el rol');
    if (nombre.length > 120) throw AppError.solicitudInvalida('El nombre es demasiado largo');
    salida.nombre = nombre;
  }
  if (datos.descripcion !== undefined) {
    salida.descripcion = String(datos.descripcion || '').trim().slice(0, 400);
  }
  if (datos.rolBase !== undefined) {
    if (!ROLES_PERSONAL.includes(datos.rolBase)) {
      throw AppError.solicitudInvalida('El rol base no es válido');
    }
    salida.rolBase = datos.rolBase;
  }
  if (datos.permisos !== undefined) {
    const lista = Array.isArray(datos.permisos) ? datos.permisos : [];
    salida.permisos = [...new Set(lista.filter((p) => PERMISOS.includes(p)))];
  }
  if (datos.activo !== undefined) salida.activo = datos.activo === true;
  return salida;
}

export async function listar(repositorio) {
  const roles = await repositorio.rolesPersonalizados();
  const usuarios = await repositorio.todosLosUsuarios();
  const conteo = new Map();
  for (const u of usuarios) {
    if (u.rolPersonalizadoId) {
      conteo.set(u.rolPersonalizadoId, (conteo.get(u.rolPersonalizadoId) || 0) + 1);
    }
  }
  return roles.map((rol) => ({ ...rol, cuentas: conteo.get(rol.id) || 0 }));
}

export async function crear(repositorio, actor, datos = {}) {
  exigirMaestro(actor);
  const limpio = validar(datos);
  const ahora = new Date().toISOString();
  const rol = {
    id: nuevoId(),
    nombre: limpio.nombre,
    descripcion: limpio.descripcion || '',
    rolBase: limpio.rolBase || 'funcionario',
    permisos: limpio.permisos || [],
    activo: limpio.activo !== false,
    creadoPor: actor?.username || null,
    creadoEn: ahora,
    actualizadoEn: ahora
  };
  await repositorio.crearRolPersonalizado(rol);
  return rol;
}

export async function actualizar(repositorio, actor, id, datos = {}) {
  exigirMaestro(actor);
  const actual = await repositorio.rolPersonalizadoPorId(id);
  if (!actual) throw AppError.noEncontrado('Rol especial no encontrado');
  const limpio = validar(datos, { parcial: true });
  return repositorio.actualizarRolPersonalizado(id, {
    ...limpio,
    actualizadoEn: new Date().toISOString()
  });
}

export async function eliminar(repositorio, actor, id) {
  exigirMaestro(actor);
  const actual = await repositorio.rolPersonalizadoPorId(id);
  if (!actual) throw AppError.noEncontrado('Rol especial no encontrado');
  await repositorio.eliminarRolPersonalizado(id);
  return { eliminado: true, id };
}

/** Catálogo para el modal de usuarios. */
export async function catalogo(repositorio) {
  const roles = await repositorio.rolesPersonalizados();
  return {
    roles: roles.filter((r) => r.activo !== false),
    permisos: PERMISOS.map((clave) => ({ clave }))
  };
}

/* ------------------------------------------------------------------------- */
/* V2.11 — roles integrados editables y roles propios                        */
/* ------------------------------------------------------------------------- */

/**
 * Plantillas admitidas para un rol propio. Se excluyen los roles de
 * administración: crear un «admin municipal 2» desde el panel solo duplicaría
 * privilegios y complicaría las salvaguardas de último administrador.
 */
export const PLANTILLAS_ROL_PROPIO = [
  'funcionario',
  'auditor',
  'enlace_estatal',
  'enlace_federal',
  'soporte'
];

const TERRITORIOS_ROL = ['municipios', 'estados', 'ambos', 'ninguno'];

/** Convierte una etiqueta en una clave estable (`Supervisor de zona`). */
export function claveDeRol(etiqueta) {
  return String(etiqueta || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function exigirRolMaestro(actor) {
  if (!esAdminMaestro(actor)) {
    throw AppError.prohibido('Solo el administrador maestro puede gestionar roles');
  }
}

function validarRol(datos = {}, { parcial = false } = {}) {
  const salida = {};
  if (!parcial || datos.etiqueta !== undefined) {
    const etiqueta = String(datos.etiqueta || '').trim();
    if (!etiqueta) throw AppError.solicitudInvalida('Escribe un nombre para el rol');
    if (etiqueta.length > 120) throw AppError.solicitudInvalida('El nombre es demasiado largo');
    salida.etiqueta = etiqueta;
  }
  if (datos.descripcion !== undefined) {
    salida.descripcion = String(datos.descripcion || '').trim().slice(0, 400);
  }
  if (datos.rolPlantilla !== undefined) {
    if (!PLANTILLAS_ROL_PROPIO.includes(datos.rolPlantilla)) {
      throw AppError.solicitudInvalida(
        'La plantilla del rol debe ser funcionario, auditor, enlace o soporte'
      );
    }
    salida.rolPlantilla = datos.rolPlantilla;
  }
  if (datos.territorio !== undefined) {
    if (!TERRITORIOS_ROL.includes(datos.territorio)) {
      throw AppError.solicitudInvalida('El territorio del rol no es válido');
    }
    salida.territorio = datos.territorio;
  }
  if (datos.permisos !== undefined) {
    const lista = Array.isArray(datos.permisos) ? datos.permisos : [];
    salida.permisos = [...new Set(lista.filter((p) => PERMISOS.includes(p)))];
  }
  if (datos.activo !== undefined) salida.activo = datos.activo === true;
  if (datos.orden !== undefined) {
    const orden = Number(datos.orden);
    salida.orden = Number.isFinite(orden) ? orden : 100;
  }
  return salida;
}

/** Roles con el número de cuentas asignadas (integrados y propios). */
export async function listarRoles(repositorio, { incluirInactivos = false } = {}) {
  const [roles, usuarios] = await Promise.all([
    repositorio.roles(),
    repositorio.todosLosUsuarios()
  ]);
  const conteo = new Map();
  for (const usuario of usuarios) {
    if (usuario.rolConfig?.id) {
      conteo.set(usuario.rolConfig.id, (conteo.get(usuario.rolConfig.id) || 0) + 1);
    }
    if (usuario.rolPropioId) {
      conteo.set(usuario.rolPropioId, (conteo.get(usuario.rolPropioId) || 0) + 1);
    }
  }
  return roles
    .filter((rol) => incluirInactivos || rol.activo !== false)
    .map((rol) => ({
      ...rol,
      permisos: expandirPermisos(rol.permisos || []),
      cuentas: conteo.get(rol.id) || 0
    }));
}

/** Catálogo reducido que consume el formulario de alta. */
export async function catalogoAsignable(repositorio) {
  const roles = await listarRoles(repositorio);
  return {
    integrados: roles.filter((rol) => rol.tipo === 'integrado'),
    propios: roles.filter((rol) => rol.tipo === 'propio'),
    plantillas: PLANTILLAS_ROL_PROPIO,
    territorios: TERRITORIOS_ROL
  };
}

export async function crearRol(repositorio, actor, datos = {}) {
  exigirRolMaestro(actor);
  const limpio = validarRol(datos);
  const existentes = await repositorio.roles();
  const base = claveDeRol(limpio.etiqueta);
  if (!base) throw AppError.solicitudInvalida('El nombre del rol no genera una clave válida');
  let clave = base;
  let sufijo = 2;
  while (existentes.some((rol) => rol.clave === clave)) {
    clave = `${base}-${sufijo++}`;
  }
  const ahora = new Date().toISOString();
  const rol = {
    id: nuevoId(),
    clave,
    etiqueta: limpio.etiqueta,
    descripcion: limpio.descripcion || '',
    tipo: 'propio',
    rolPlantilla: limpio.rolPlantilla || 'funcionario',
    permisos: limpio.permisos || [],
    territorio: limpio.territorio || 'municipios',
    activo: limpio.activo !== false,
    orden: limpio.orden ?? 500,
    creadoPor: actor?.username || null,
    creadoEn: ahora,
    actualizadoEn: ahora
  };
  await repositorio.crearRol(rol);
  return rol;
}

export async function actualizarRol(repositorio, actor, id, datos = {}) {
  exigirRolMaestro(actor);
  const actual = await repositorio.rolPorId(id);
  if (!actual) throw AppError.noEncontrado('Rol no encontrado');
  const limpio = validarRol(datos, { parcial: true });
  if (actual.tipo === 'integrado') {
    if (limpio.rolPlantilla || limpio.territorio) {
      throw AppError.solicitudInvalida('Un rol integrado no cambia de plantilla ni de territorio');
    }
    if (datos.activo !== undefined) {
      throw AppError.solicitudInvalida('Los roles integrados no se pueden desactivar');
    }
  }
  return repositorio.actualizarRol(id, {
    ...limpio,
    actualizadoEn: new Date().toISOString()
  });
}

/** Devuelve un rol integrado a la matriz de fábrica (`PERMISOS_POR_ROL`). */
export async function restablecerRol(repositorio, actor, id) {
  exigirRolMaestro(actor);
  const actual = await repositorio.rolPorId(id);
  if (!actual) throw AppError.noEncontrado('Rol no encontrado');
  if (actual.tipo !== 'integrado') {
    throw AppError.solicitudInvalida('Solo los roles integrados tienen valores de fábrica');
  }
  const fabrica = [...(PERMISOS_POR_ROL[actual.clave] || [])];
  return repositorio.actualizarRol(id, {
    permisos: fabrica,
    actualizadoEn: new Date().toISOString()
  });
}

export async function eliminarRol(repositorio, actor, id) {
  exigirRolMaestro(actor);
  const actual = await repositorio.rolPorId(id);
  if (!actual) throw AppError.noEncontrado('Rol no encontrado');
  if (actual.tipo !== 'propio') {
    throw AppError.solicitudInvalida('Los roles integrados no se eliminan');
  }
  const usuarios = await repositorio.todosLosUsuarios();
  const asignadas = usuarios.filter((u) => u.rolPropioId === id).length;
  if (asignadas) {
    throw AppError.conflicto(
      `Ese rol tiene ${asignadas} cuenta(s) asignada(s). Cámbiales el rol antes de eliminarlo.`
    );
  }
  await repositorio.eliminarRol(id);
  return { eliminado: true, id };
}

/** Rol propio activo por id (para validar el alta de una cuenta). */
export async function rolPropioActivo(repositorio, id) {
  if (!id) return null;
  const rol = await repositorio.rolPorId(String(id));
  if (!rol || rol.tipo !== 'propio' || rol.activo === false) {
    throw AppError.solicitudInvalida('El rol propio no existe o está inactivo');
  }
  return rol;
}
