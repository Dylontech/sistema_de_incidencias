/**
 * SERVICIO: Alcance de datos según el rol.
 *
 * Corrige un defecto del monolito: los listados y estadísticas NO filtraban
 * por municipio, así que un funcionario veía reportes de otros municipios.
 * Aquí el filtro se aplica SIEMPRE en el servidor.
 *
 *   anónimo     → solo sus propios reportes
 *   funcionario → todo su municipio
 *   admin       → su municipio activo, o todos si no tiene ninguno asignado
 */
import { ROLES_EMPLEADO } from '../config/constantes.js';
import { puedeVer } from '../models/incidencia.model.js';
import { AppError } from '../utils/AppError.js';

export function esEmpleado(usuario) {
  return !!usuario && ROLES_EMPLEADO.includes(usuario.rol);
}

export function esAdmin(usuario) {
  return !!usuario && usuario.rol === 'admin';
}

/** Filtros de consulta que garantizan que nadie vea más de lo que le toca. */
export function filtrosDeAlcance(usuario, extra = {}) {
  if (!usuario) {
    throw AppError.noAutenticado();
  }

  // anónimo y funcionario quedan atados a su municipio; el admin solo si tiene
  // uno activo (null = todos los municipios).
  const filtros = { ...extra, municipioId: usuario.municipioId || null };

  if (usuario.rol === 'anonimo') {
    filtros.userKey = usuario.userKey;
  }

  return filtros;
}

/** Verifica que el usuario pueda operar sobre una incidencia concreta. */
export function exigirVisibilidad(incidencia, usuario) {
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  if (!puedeVer(incidencia, usuario)) {
    throw AppError.prohibido('No tienes acceso a esta incidencia');
  }
  // Además del rol, se aplica el alcance por municipio: el monolito solo
  // filtraba en el listado, así que un acceso directo por id lo saltaba.
  if (usuario.municipioId && incidencia.municipioId !== usuario.municipioId) {
    throw AppError.prohibido('La incidencia pertenece a otro municipio');
  }
  return incidencia;
}

/** Verifica que la incidencia pertenezca al alcance por municipio del usuario. */
export function exigirMunicipioDeAlcance(incidencia, usuario) {
  if (usuario.rol === 'admin' && !usuario.municipioId) return incidencia;
  if (usuario.municipioId && incidencia.municipioId !== usuario.municipioId) {
    throw AppError.prohibido('La incidencia pertenece a otro municipio');
  }
  return incidencia;
}
