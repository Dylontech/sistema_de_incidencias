/**
 * SERVICIO: Alcance de datos según el rol y el territorio asignado.
 *
 * Los reportes son **públicos** para ciudadanos y sesiones anónimas: pueden
 * consultar cualquier municipio y estado. El personal, en cambio, queda
 * limitado a las asignaciones que le dé un administrador:
 *
 *   anónimo / ciudadano → todo el país (solo editan lo suyo)
 *   funcionario         → municipios asignados (escritura, si está habilitado)
 *   auditor             → municipios/estados asignados (solo lectura)
 *   enlace_estatal      → todos los municipios de sus estados (solo lectura)
 *   enlace_federal      → municipios de sus estados asignados (solo lectura)
 *   admin               → todo, o solo su municipio activo si lo elige
 *
 * La autorización se resuelve SIEMPRE en el servidor: el ámbito no viaja en el
 * token, se recarga de la base en cada petición (ver `middlewares/auth.js`).
 */
import { ROLES_ADMIN, ROLES_PERSONAL } from '../config/constantes.js';
import { puedeEscribirDe } from '../models/usuario.model.js';
import { puedeVer } from '../models/incidencia.model.js';
import { AppError } from '../utils/AppError.js';

/** Personal con acceso al panel, sea de lectura o de escritura. */
export function esEmpleado(usuario) {
  return !!usuario && ROLES_PERSONAL.includes(usuario.rol);
}

/** Alias semántico: todo el personal (incluidos auditores y enlaces). */
export const esPersonal = esEmpleado;

export function esAdmin(usuario) {
  return !!usuario && usuario.rol === 'admin';
}

/** Administrador maestro: alcance global y gestión de otros administradores. */
export function esAdminMaestro(usuario) {
  return !!usuario && usuario.rol === 'admin';
}

/** Administrador acotado a un estado o a un conjunto de municipios. */
export function esAdminTerritorial(usuario) {
  return !!usuario && (usuario.rol === 'admin_estatal' || usuario.rol === 'admin_municipal');
}

/** Cualquier nivel de administración. */
export function esAlgunaAdmin(usuario) {
  return !!usuario && ROLES_ADMIN.includes(usuario.rol);
}

/** ¿Puede mutar datos? Los roles de lectura y los funcionarios revocados, no. */
export function puedeEscribir(usuario) {
  return puedeEscribirDe(usuario);
}

/** ¿Es personal de solo lectura? (auditor, enlace estatal/federal). */
export function esSoloLectura(usuario) {
  return esEmpleado(usuario) && !puedeEscribirDe(usuario);
}

/** ¿Puede editar reportes, estados, resoluciones y moderar? */
export function puedeOperar(usuario) {
  return puedeEscribirDe(usuario);
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

/** Lista limpia, sin vacíos ni duplicados. */
function listaUnica(valor) {
  if (!valor) return [];
  const lista = Array.isArray(valor) ? valor : [valor];
  return [...new Set(lista.map((v) => String(v).trim()).filter(Boolean))];
}

/**
 * Alcance efectivo del usuario.
 *
 * @returns {{todos:boolean, municipios:Set<string>|null, estados:Set<string>|null}}
 *  - `todos`: sin recorte territorial (ciudadanos y admin global).
 *  - `municipios`: conjunto permitido (puede estar vacío = sin acceso).
 *  - `estados`: conjunto de entidades permitidas.
 */
export function alcanceDe(usuario) {
  if (!usuario) {
    throw AppError.noAutenticado();
  }

  // Ciudadanos y sesiones anónimas recorren todo el catálogo.
  if (!esEmpleado(usuario)) {
    return { todos: true, municipios: null, estados: null };
  }

  if (usuario.rol === 'admin') {
    // El administrador maestro ve todo el país; los administradores
    // territoriales se configuran más abajo con sus asignaciones.
    return { todos: true, municipios: null, estados: null };
  }

  if (esAdminTerritorial(usuario)) {
    const municipiosAdmin = listaUnica(usuario.municipios);
    const estadosAdmin = listaUnica(usuario.estados);
    if (municipiosAdmin.length) {
      return { todos: false, municipios: new Set(municipiosAdmin), estados: null };
    }
    if (estadosAdmin.length) {
      return { todos: false, municipios: null, estados: new Set(estadosAdmin) };
    }
    // Un administrador territorial sin asignaciones no ve nada.
    return { todos: false, municipios: new Set(), estados: null };
  }

  const municipios = listaUnica(usuario.municipios);
  const estados = listaUnica(usuario.estados);

  // Prioridad: asignación municipal explícita; si no, estatal.
  if (municipios.length) {
    return { todos: false, municipios: new Set(municipios), estados: null };
  }
  if (estados.length) {
    return { todos: false, municipios: null, estados: new Set(estados) };
  }

  // Compatibilidad con cuentas anteriores a las asignaciones N:M.
  if (usuario.municipioId) {
    return { todos: false, municipios: new Set([usuario.municipioId]), estados: null };
  }

  // Personal sin territorio: no ve nada hasta que se le asigne.
  return { todos: false, municipios: new Set(), estados: null };
}

/** Municipios permitidos, o `null` si el alcance es por estado/global. */
export function municipiosPermitidos(usuario) {
  return alcanceDe(usuario).municipios;
}

/** Estados permitidos, o `null` si el alcance es municipal/global. */
export function estadosPermitidos(usuario) {
  return alcanceDe(usuario).estados;
}

/** ¿Puede consultar este municipio? */
export function puedeVerMunicipio(usuario, municipioId) {
  if (!esEmpleado(usuario)) return true;
  const alcance = alcanceDe(usuario);
  if (alcance.todos) return true;
  if (alcance.municipios) return alcance.municipios.has(String(municipioId || ''));
  return true; // alcance estatal: se valida con el estado de la incidencia
}

/** ¿Puede consultar este municipio conociendo su entidad federativa? */
export function puedeVerMunicipioCompleto(usuario, municipio) {
  if (!municipio) return false;
  if (!esEmpleado(usuario)) return true;
  const alcance = alcanceDe(usuario);
  if (alcance.todos) return true;
  if (alcance.municipios) return alcance.municipios.has(String(municipio.id));
  if (alcance.estados) return alcance.estados.has(String(municipio.estado));
  return false;
}

/** ¿Puede consultar este estado? */
export function puedeVerEstado(usuario, estado) {
  if (!esEmpleado(usuario)) return true;
  const alcance = alcanceDe(usuario);
  if (alcance.todos) return true;
  if (alcance.estados) return alcance.estados.has(String(estado || ''));
  return true; // alcance municipal: se valida con el municipio
}

/** ¿Puede ver esta incidencia según su territorio? */
export function puedeVerIncidencia(incidencia, usuario) {
  if (!esEmpleado(usuario)) return true;
  const alcance = alcanceDe(usuario);
  if (alcance.todos) return true;
  if (alcance.municipios) {
    return alcance.municipios.has(String(incidencia.municipioId || ''));
  }
  if (alcance.estados) {
    return alcance.estados.has(String(incidencia.estadoEntidad || ''));
  }
  return false;
}

/**
 * Jerarquía de sanciones: nadie puede advertir ni suspender a un rol igual o
 * superior. Un funcionario solo alcanza a las cuentas ciudadanas; un admin
 * también al personal. (Que no se sancione a sí mismo lo comprueba el
 * servicio, que es quien conoce la cuenta objetivo.)
 */
export function puedeSancionarA(actor, objetivo) {
  if (!puedeEscribirDe(actor) || !objetivo) return false;
  if (esAdmin(actor)) {
    return objetivo.rol === 'ciudadano' || ROLES_PERSONAL.includes(objetivo.rol);
  }
  return objetivo.rol === 'ciudadano';
}

/**
 * Filtros de consulta que garantizan que nadie vea más de lo que le toca.
 *
 * - Personal municipal: se envía `municipios` (IN) o `municipioId` si solo hay
 *   uno. Pedir un municipio fuera del alcance es 403, no una lista vacía.
 * - Personal estatal/federal: se envía `estados` (IN) o `estadoEntidad`.
 * - Ciudadanos: el municipio solicitado manda; si no, el municipio activo.
 */
export function filtrosDeAlcance(usuario, extra = {}) {
  if (!usuario) {
    throw AppError.noAutenticado();
  }

  const { municipioId, estadoEntidad, estados, ...resto } = extra;
  const solicitado = municipioId && municipioId !== 'todos' ? String(municipioId) : null;
  const estadoSolicitado =
    estadoEntidad && estadoEntidad !== 'todos' ? String(estadoEntidad) : null;

  // Ciudadanos y anónimos: el municipio activo es solo un valor por defecto.
  if (!esEmpleado(usuario)) {
    return {
      ...resto,
      municipioId: solicitado || usuario.municipioId || null,
      estadoEntidad: estadoSolicitado
    };
  }

  const alcance = alcanceDe(usuario);

  if (alcance.todos) {
    return {
      ...resto,
      municipioId: solicitado || usuario.municipioId || null,
      estadoEntidad: estadoSolicitado
    };
  }

  if (alcance.municipios) {
    if (alcance.municipios.size === 0) {
      throw AppError.prohibido('Tu cuenta no tiene municipios asignados');
    }
    if (solicitado && !alcance.municipios.has(solicitado)) {
      throw AppError.prohibido('No tienes acceso a ese municipio');
    }
    if (solicitado) {
      return { ...resto, municipioId: solicitado, estadoEntidad: estadoSolicitado };
    }
    if (alcance.municipios.size === 1) {
      return {
        ...resto,
        municipioId: [...alcance.municipios][0],
        estadoEntidad: estadoSolicitado
      };
    }
    return { ...resto, municipios: [...alcance.municipios], estadoEntidad: estadoSolicitado };
  }

  // Alcance estatal/federal.
  const permitidos = alcance.estados || new Set();
  if (permitidos.size === 0) {
    throw AppError.prohibido('Tu cuenta no tiene estados asignados');
  }
  const pedidos = listaUnica(estados);
  for (const estado of pedidos) {
    if (!permitidos.has(estado)) throw AppError.prohibido('No tienes acceso a ese estado');
  }
  if (estadoSolicitado && !permitidos.has(estadoSolicitado)) {
    throw AppError.prohibido('No tienes acceso a ese estado');
  }

  return {
    ...resto,
    municipioId: solicitado,
    estadoEntidad: estadoSolicitado || (pedidos.length === 1 ? pedidos[0] : null),
    estados: pedidos.length ? pedidos : [...permitidos]
  };
}

/**
 * Municipio en el que se va a registrar un reporte.
 *
 * El personal solo puede registrar dentro de su alcance y, si tiene varios
 * municipios, debe elegir uno explícitamente (no se adivina). El ciudadano y
 * el anónimo usan el municipio que envían; si no llega ninguno se conserva el
 * municipio activo por compatibilidad con clientes antiguos.
 */
export function municipioDeRegistro(usuario, solicitado) {
  if (esEmpleado(usuario)) {
    const alcance = alcanceDe(usuario);
    if (alcance.todos) return solicitado || usuario.municipioId || null;
    if (alcance.municipios) {
      if (solicitado) {
        if (!alcance.municipios.has(String(solicitado))) {
          throw AppError.prohibido('No puedes reportar fuera de los municipios que tienes asignados');
        }
        return String(solicitado);
      }
      if (alcance.municipios.size === 1) return [...alcance.municipios][0];
      if (alcance.municipios.size === 0) {
        throw AppError.prohibido('Tu cuenta no tiene municipios asignados');
      }
      throw AppError.solicitudInvalida('Elige el municipio del reporte');
    }
    if (alcance.estados) {
      if (!solicitado) {
        throw AppError.solicitudInvalida('Elige el municipio del reporte');
      }
      return String(solicitado);
    }
  }

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
  // El recorte territorial solo se impone al personal. Ciudadanos y anónimos
  // recorren el catálogo completo.
  if (!puedeVerIncidencia(incidencia, usuario)) {
    throw AppError.prohibido('La incidencia pertenece a otro ámbito territorial');
  }
  return incidencia;
}

/** Verifica que la incidencia pertenezca al alcance territorial del usuario. */
export function exigirMunicipioDeAlcance(incidencia, usuario) {
  if (!puedeVerIncidencia(incidencia, usuario)) {
    throw AppError.prohibido('La incidencia pertenece a otro ámbito territorial');
  }
  return incidencia;
}
