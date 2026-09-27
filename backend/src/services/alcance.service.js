/**
 * SERVICIO: Alcance de datos según el rol.
 *
 * Los reportes son **públicos dentro del municipio**: cualquier ciudadano ve
 * todas las incidencias de su municipio activo (y solo de ese). Lo que sigue
 * restringido es la escritura: un ciudadano únicamente puede editar y resolver
 * gestiones propias, y las operaciones de personal se comprueban aparte.
 *
 *   anónimo     → todo su municipio (solo edita lo suyo)
 *   ciudadano   → todo el municipio que elija (solo edita lo suyo)
 *   funcionario → todo su municipio
 *   admin       → todos los municipios, o solo el que tenga activo
 */
import { ROLES_EMPLEADO } from '../config/constantes.js';
import { puedeVer } from '../models/incidencia.model.js';
import { AppError } from '../utils/AppError.js';

/**
 * Roles que pueden cambiar de municipio desde la interfaz: cualquiera que no
 * sea personal del municipio (el funcionario está atado al suyo).
 */
function puedeElegirMunicipio(usuario) {
  return !ROLES_EMPLEADO.includes(usuario.rol);
}

export function esEmpleado(usuario) {
  return !!usuario && ROLES_EMPLEADO.includes(usuario.rol);
}

export function esAdmin(usuario) {
  return !!usuario && usuario.rol === 'admin';
}

/** ¿El usuario es el autor del contenido (reporte o comentario)? */
export function esAutorDe(contenido, usuario) {
  return Boolean(contenido?.userKey) && contenido.userKey === usuario?.userKey;
}

/**
 * ¿Puede ver un contenido retirado por moderación?
 *
 * El personal sí (es quien modera) y el autor también: se le muestra con un
 * aviso para que sepa que su publicación sigue existiendo pero no es pública.
 */
export function puedeVerOculto(contenido, usuario) {
  if (esEmpleado(usuario)) return true;
  return esAutorDe(contenido, usuario);
}

/**
 * ¿Qué hacer con las publicaciones ocultas en un listado?
 *
 *  - `incluir`: el personal ve todo, ocultas incluidas.
 *  - `propias`: el autor ve las suyas ocultas (con aviso) y las visibles de todos.
 *  - `excluir`: el resto solo ve lo visible.
 */
export function filtroOcultas(usuario) {
  if (esEmpleado(usuario)) return 'incluir';
  return usuario?.userKey ? 'propias' : 'excluir';
}

/**
 * Jerarquía de sanciones: nadie puede advertir ni suspender a un rol igual o
 * superior. Un funcionario solo alcanza a las cuentas ciudadanas; un admin
 * también a los funcionarios. (Que no se sancione a sí mismo lo comprueba el
 * servicio, que es quien conoce la cuenta objetivo.)
 */
export function puedeSancionarA(actor, objetivo) {
  if (!esEmpleado(actor) || !objetivo) return false;
  if (esAdmin(actor)) return objetivo.rol === 'ciudadano' || objetivo.rol === 'funcionario';
  return objetivo.rol === 'ciudadano';
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

  // El municipio es el único recorte: dentro de él, el listado es público.
  return { ...resto, municipioId: efectivo };
}

/**
 * Municipio en el que se va a registrar un reporte.
 *
 * Un empleado **con municipio asignado** manda sobre lo que pida el cliente (el
 * funcionario está atado al suyo); el ciudadano, el anónimo y el administrador
 * —que no tiene municipio fijo, o elige el activo en la barra superior— usan el
 * que envió el cliente. Sin esta distinción, un administrador sin municipio se
 * quedaba sin municipio de registro y solo podía reportar dentro de una
 * comunidad, porque se le aplicaba la regla estricta de clientes antiguos.
 */
export function municipioDeRegistro(usuario, solicitado) {
  if (esEmpleado(usuario) && usuario.municipioId) return usuario.municipioId;
  return solicitado || usuario.municipioId || null;
}

/** Verifica que el usuario pueda operar sobre una incidencia concreta. */
export function exigirVisibilidad(incidencia, usuario) {
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  if (!puedeVer(incidencia, usuario)) {
    throw AppError.prohibido('No tienes acceso a esta incidencia');
  }
  // Una publicación retirada por moderación solo la ven el personal y su autor.
  // Al resto se le responde 404 (no 403): no hay que delatar que existe.
  if (incidencia.oculta === true && !puedeVerOculto(incidencia, usuario)) {
    throw AppError.noEncontrado('Incidencia no encontrada');
  }
  // El recorte por municipio solo se impone a quien NO puede elegir municipio
  // (el funcionario está atado al suyo). El ciudadano y el admin recorren el
  // catálogo con el selector de la barra superior, así que pueden abrir el
  // detalle de cualquier municipio: el listado ya viene filtrado por el activo.
  if (fueraDeSuMunicipio(incidencia, usuario)) {
    throw AppError.prohibido('La incidencia pertenece a otro municipio');
  }
  return incidencia;
}

/** ¿La incidencia cae fuera del municipio al que el usuario está atado? */
function fueraDeSuMunicipio(incidencia, usuario) {
  if (puedeElegirMunicipio(usuario)) return false;
  return Boolean(usuario.municipioId) && incidencia.municipioId !== usuario.municipioId;
}

/** Verifica que la incidencia pertenezca al alcance por municipio del usuario. */
export function exigirMunicipioDeAlcance(incidencia, usuario) {
  if (fueraDeSuMunicipio(incidencia, usuario)) {
    throw AppError.prohibido('La incidencia pertenece a otro municipio');
  }
  return incidencia;
}
