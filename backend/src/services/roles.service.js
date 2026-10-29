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
import { PERMISOS, ROLES_PERSONAL } from '../config/constantes.js';
import { esAdminMaestro } from './alcance.service.js';
import { normalizarPermisos } from './permisos.service.js';

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
