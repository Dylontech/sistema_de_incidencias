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

/** Roles que pueden cambiar de municipio desde la interfaz. */
function puedeElegirMunicipio(usuario) {
  return usuario.rol === 'admin' || usuario.rol === 'anonimo';
}

export function esEmpleado(usuario) {
  return !!usuario && ROLES_EMPLEADO.includes(usuario.rol);
}

export function esAdmin(usuario) {
  return !!usuario && usuario.rol === 'admin';
}

/**
 * Filtros de consulta que garantizan que nadie vea más de lo que le toca.
 *
 * El municipio activo lo elige el usuario en el selector (que es público),
 * así que la consulta puede pedir cualquiera. La excepción es el funcionario:
 * sigue atado al municipio que tiene asignado, porque su alcance no puede
 * depender de lo que envíe el navegador.
 */
export function filtrosDeAlcance(usuario, extra = {}) {
  if (!usuario) {
    throw AppError.noAutenticado();
  }

  const { municipioId, ...resto } = extra;
  const solicitado = municipioId && municipioId !== 'todos' ? municipioId : null;
  const atado = !puedeElegirMunicipio(usuario) && usuario.municipioId;
  const efectivo = atado || solicitado || usuario.municipioId || null;

  const filtros = { ...resto, municipioId: efectivo };

  if (usuario.rol === 'anonimo') {
    filtros.userKey = usuario.userKey;
  }

  return filtros;
}

/**
 * Municipio en el que se va a registrar un reporte: el que envió el cliente si
 * el rol puede elegirlo (ciudadano o admin) y, si no, el asignado al usuario.
 */
export function municipioDeRegistro(usuario, solicitado) {
  if (puedeElegirMunicipio(usuario)) return solicitado || usuario.municipioId || null;
  return usuario.municipioId || null;
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
