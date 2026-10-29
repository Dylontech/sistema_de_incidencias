/**
 * SERVICIO: cuentas del personal (funcionario, auditor, enlaces y admin).
 *
 * El ciudadano se registra por su cuenta (`auth.service.registrarCiudadano`),
 * pero las cuentas de personal las crea y mantiene un administrador desde el
 * panel: son llaves de acceso al territorio, no algo que cualquiera pueda
 * abrirse.
 *
 * El alcance se guarda en dos tablas N:M (`usuario_municipios`,
 * `usuario_estados`). `municipioId` se conserva como municipio principal para
 * la barra superior y para las cuentas anteriores a esta versión.
 */
import { AppError } from '../utils/AppError.js';
import {
  LIMITES_TEXTO,
  ROLES_ADMIN,
  ROLES_LECTURA,
  ROLES_PERSONAL
} from '../config/constantes.js';
import {
  alcanceDe,
  esAdmin,
  esAdminMaestro,
  esAdminTerritorial,
  esAlgunaAdmin
} from './alcance.service.js';
import { normalizarPermisos, permisosDe, tienePermiso } from './permisos.service.js';
import {
  construirUsuario,
  hashearPassword,
  publico,
  validarEntrada,
  puedeEscribirDe
} from '../models/usuario.model.js';

/** Contraseña obligatoria al crear y, si viene, también al editar. */
function exigirPassword(password) {
  const limpio = String(password ?? '');
  if (limpio.length < LIMITES_TEXTO.passwordMin) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo: 'password', mensaje: `Debe tener al menos ${LIMITES_TEXTO.passwordMin} caracteres` }
    ]);
  }
  return limpio;
}

async function exigirUsernameLibre(repositorio, username) {
  if (await repositorio.usuarioPorUsername(username)) {
    throw AppError.conflicto('Ya existe un usuario con ese nombre de acceso');
  }
}

function listaUnica(valor) {
  if (!valor) return [];
  const lista = Array.isArray(valor) ? valor : [valor];
  return [...new Set(lista.map((v) => String(v).trim()).filter(Boolean))];
}

/**
 * Normaliza y valida las asignaciones territoriales.
 *
 * - `funcionario`: necesita al menos un municipio (puede tener varios).
 * - `auditor`: municipios o estados.
 * - `enlace_estatal` / `enlace_federal`: al menos un estado.
 * - `admin`: sin restricciones (alcance global).
 */
async function validarAlcance(repositorio, rol, { municipios = [], estados = [] } = {}) {
  const idsMunicipios = listaUnica(municipios);
  const nombresEstados = listaUnica(estados);

  const catalogo = await repositorio.todosMunicipios();
  const porId = new Map(catalogo.map((m) => [m.id, m]));
  const estadosValidos = new Set(catalogo.map((m) => m.estado));

  for (const id of idsMunicipios) {
    if (!porId.has(id)) {
      throw AppError.solicitudInvalida('Datos inválidos', [
        { campo: 'municipios', mensaje: `Municipio no encontrado: ${id}` }
      ]);
    }
  }
  for (const estado of nombresEstados) {
    if (!estadosValidos.has(estado)) {
      throw AppError.solicitudInvalida('Datos inválidos', [
        { campo: 'estados', mensaje: `Estado no encontrado: ${estado}` }
      ]);
    }
  }

  if (rol === 'funcionario' && !idsMunicipios.length) {
    throw AppError.solicitudInvalida('Elige al menos un municipio para el funcionario');
  }
  if (rol === 'admin_municipal' && !idsMunicipios.length) {
    throw AppError.solicitudInvalida('Elige al menos un municipio para el administrador municipal');
  }
  if (rol === 'admin_estatal' && !idsMunicipios.length && !nombresEstados.length) {
    throw AppError.solicitudInvalida('Elige al menos un estado para el administrador estatal');
  }
  if (rol === 'auditor' && !idsMunicipios.length && !nombresEstados.length) {
    throw AppError.solicitudInvalida('Elige al menos un municipio o estado para el auditor');
  }
  if (rol === 'soporte' && !idsMunicipios.length && !nombresEstados.length) {
    throw AppError.solicitudInvalida('Elige al menos un municipio o estado para soporte');
  }
  if (ROLES_LECTURA.includes(rol) && rol !== 'auditor' && !nombresEstados.length) {
    throw AppError.solicitudInvalida('Elige al menos un estado para el enlace');
  }

  return { municipios: idsMunicipios, estados: nombresEstados };
}

/** Cuántos administradores activos quedan (para no dejar el panel sin acceso). */
async function administradoresActivos(repositorio, { exceptoId = null } = {}) {
  const usuarios = await repositorio.todosLosUsuarios();
  return usuarios.filter(
    (u) => u.rol === 'admin' && u.activo !== false && u.id !== exceptoId
  ).length;
}

/** ¿El actor puede ver/gestionar esta cuenta según su territorio? */
function visiblePara(actor, cuenta, alcanceCuenta, estadoDeMunicipio = new Map()) {
  if (esAdminMaestro(actor)) return true;
  const alcance = alcanceDe(actor);
  if (alcance.todos) return true;

  const municipiosCuenta = alcanceCuenta.municipios.length
    ? alcanceCuenta.municipios
    : cuenta.municipioId
      ? [cuenta.municipioId]
      : [];

  if (alcance.municipios) {
    return municipiosCuenta.some((m) => alcance.municipios.has(m));
  }
  if (alcance.estados) {
    const estadosCuenta = new Set(alcanceCuenta.estados || []);
    for (const id of municipiosCuenta) {
      const estado = estadoDeMunicipio.get(id);
      if (estado) estadosCuenta.add(estado);
    }
    return [...estadosCuenta].some((estado) => alcance.estados.has(estado));
  }
  return false;
}

/**
 * ¿Puede el actor crear o editar una cuenta con este rol y territorio?
 *
 * El administrador maestro puede todo. Los administradores territoriales solo
 * gestionan cuentas de funcionario/auditor/soporte dentro de su ámbito y no
 * pueden tocar cuentas de administración.
 */
async function exigirPuedeGestionar(repositorio, actor, { rol, municipios = [], estados = [] }) {
  if (esAdminMaestro(actor)) return;
  // Un funcionario o soporte con `gestionar_usuarios` aprobado puede crear y
  // editar cuentas, pero solo dentro de su ámbito y nunca administradores.
  const porPermiso = tienePermiso(actor, 'gestionar_usuarios');
  if (!esAdminTerritorial(actor) && !porPermiso) {
    throw AppError.prohibido('No puedes gestionar cuentas del personal');
  }
  if (ROLES_ADMIN.includes(rol)) {
    throw AppError.prohibido('Solo el administrador maestro puede gestionar administradores');
  }

  const alcance = alcanceDe(actor);
  if (alcance.todos) return;

  if (alcance.municipios) {
    if (municipios.some((id) => !alcance.municipios.has(id))) {
      throw AppError.prohibido('Alguno de los municipios está fuera de tu ámbito');
    }
    return;
  }

  if (alcance.estados) {
    if (estados.some((estado) => !alcance.estados.has(estado))) {
      throw AppError.prohibido('Alguno de los estados está fuera de tu ámbito');
    }
    const catalogo = await repositorio.todosMunicipios();
    const porId = new Map(catalogo.map((m) => [m.id, m.estado]));
    if (municipios.some((id) => !alcance.estados.has(porId.get(id)))) {
      throw AppError.prohibido('Alguno de los municipios está fuera de tu ámbito');
    }
  }
}

/**
 * Listado del panel: solo cuentas del personal (los ciudadanos no se exponen)
 * y, para un funcionario/auditor, solo las de su ámbito.
 */
export async function listar(repositorio, actor, { tipo = 'personal' } = {}) {
  const usuarios = (await repositorio.todosLosUsuarios()).filter((u) => u.simulado !== true);

  if (tipo === 'ciudadanos') {
    if (!esAdmin(actor)) return [];
    return usuarios
      .filter((u) => u.rol === 'ciudadano')
      .map((u) => publico({ ...u, municipios: [], estados: [] }));
  }

  const personal = usuarios.filter((u) => ROLES_PERSONAL.includes(u.rol));
  const alcances = await repositorio.alcancesDeUsuarios(personal.map((u) => u.id));
  const catalogo = await repositorio.todosMunicipios();
  const estadoDeMunicipio = new Map(catalogo.map((m) => [m.id, m.estado]));

  return personal
    .map((u) => {
      const asignado = alcances[u.id] || { municipios: [], estados: [] };
      return { ...u, ...asignado };
    })
    .filter((u) =>
      visiblePara(actor, u, { municipios: u.municipios, estados: u.estados }, estadoDeMunicipio)
    )
    .map(publico);
}

/** Comprueba el rol especial y devuelve su rol base. */
async function rolEspecial(repositorio, id) {
  if (!id) return null;
  const rol = await repositorio.rolPersonalizadoPorId(String(id));
  if (!rol || rol.activo === false) {
    throw AppError.solicitudInvalida('El rol especial no existe o está inactivo');
  }
  return rol;
}

/** Alta de una cuenta de personal. */
export async function crear(repositorio, datos = {}, { actor = null } = {}) {
  const entrada = validarEntrada(datos);
  const especial = await rolEspecial(repositorio, entrada.rolPersonalizadoId);
  if (especial && especial.rolBase !== entrada.rol) {
    throw AppError.solicitudInvalida(
      `El rol especial «${especial.nombre}» solo aplica al rol base ${especial.rolBase}`
    );
  }
  await exigirUsernameLibre(repositorio, entrada.username);
  const password = exigirPassword(datos.password);

  const alcance = await validarAlcance(repositorio, entrada.rol, {
    municipios: datos.municipios ?? (entrada.municipioId ? [entrada.municipioId] : []),
    estados: datos.estados ?? []
  });

  if (actor) {
    await exigirPuedeGestionar(repositorio, actor, {
      rol: entrada.rol,
      municipios: alcance.municipios,
      estados: alcance.estados
    });
  }

  const usuario = construirUsuario({
    username: entrada.username,
    nombre: entrada.nombre,
    correo: entrada.correo ?? null,
    rol: entrada.rol,
    municipioId: alcance.municipios[0] || null,
    passwordHash: await hashearPassword(password),
    rolPersonalizadoId: especial?.id || null,
    puedeEscribir: ROLES_LECTURA.includes(entrada.rol) ? false : entrada.rol !== 'soporte'
  });

  // El panel puede crear la cuenta ya inactiva o con permisos a medida.
  if (datos.activo === false) usuario.activo = false;
  if (datos.permisos !== undefined) {
    const normalizados = normalizarPermisos(datos.permisos);
    if (normalizados) usuario.permisos = normalizados;
  }

  const creado = await repositorio.crearUsuario(usuario);
  await repositorio.guardarAlcanceUsuario(creado.id, alcance);

  return publico({
    ...creado,
    ...alcance,
    rolPersonalizado: especial || null,
    permisosEfectivos: permisosDe({ ...creado, rolPersonalizado: especial || null })
  });
}

/**
 * Edición de una cuenta del personal: nombre, rol, alcance, correo, estado,
 * permiso de escritura y (opcionalmente) contraseña. El `username` no se toca
 * nunca: es la llave de acceso y el `userKey` que da autoría a sus reportes.
 */
export async function actualizar(repositorio, actor, id, datos = {}) {
  const actual = await repositorio.usuarioPorId(id);
  if (!actual) throw AppError.noEncontrado('Usuario no encontrado');
  if (!ROLES_PERSONAL.includes(actual.rol)) {
    throw AppError.prohibido('Esa cuenta no es del personal del sistema');
  }
  if (ROLES_ADMIN.includes(actual.rol) && !esAdminMaestro(actor)) {
    throw AppError.prohibido('Solo el administrador maestro puede editar administradores');
  }

  const cambios = validarEntrada(datos, { parcial: true });
  delete cambios.username;
  delete cambios.pseudonimo;
  const especial = await rolEspecial(repositorio, cambios.rolPersonalizadoId);

  const rol = cambios.rol || actual.rol;
  if (especial && especial.rolBase !== rol) {
    throw AppError.solicitudInvalida(
      `El rol especial «${especial.nombre}» solo aplica al rol base ${especial.rolBase}`
    );
  }
  const asignacionActual = await repositorio.alcanceDeUsuario(id);

  const pedidos =
    datos.municipios !== undefined || datos.estados !== undefined
      ? {
          municipios: datos.municipios ?? asignacionActual.municipios,
          estados: datos.estados ?? asignacionActual.estados
        }
      : {
          municipios: asignacionActual.municipios.length
            ? asignacionActual.municipios
            : actual.municipioId
              ? [actual.municipioId]
              : [],
          estados: asignacionActual.estados
        };

  const alcance = await validarAlcance(repositorio, rol, pedidos);
  cambios.municipioId = alcance.municipios[0] || null;

  await exigirPuedeGestionar(repositorio, actor, {
    rol,
    municipios: alcance.municipios,
    estados: alcance.estados
  });

  // Los roles de lectura no pueden conservar la escritura.
  if (ROLES_LECTURA.includes(rol) || rol === 'soporte') {
    cambios.puedeEscribir = false;
  } else if (datos.puedeEscribir !== undefined) {
    cambios.puedeEscribir = datos.puedeEscribir === true;
  } else if (cambios.rol && cambios.rol !== actual.rol) {
    cambios.puedeEscribir = true;
  }

  // Nunca quedarse sin acceso al panel: ni desactivándose uno mismo ni con el
  // último administrador activo.
  if (cambios.activo === false || (cambios.rol && cambios.rol !== 'admin')) {
    if (actor?.id === actual.id || actor?.username === actual.username) {
      throw AppError.conflicto('No puedes quitarte a ti mismo el acceso de administrador');
    }
    if (
      actual.rol === 'admin' &&
      (await administradoresActivos(repositorio, { exceptoId: id })) === 0
    ) {
      throw AppError.conflicto('Debe quedar al menos un administrador activo');
    }
  }

  if (datos.password) cambios.passwordHash = await hashearPassword(exigirPassword(datos.password));
  if (datos.permisos !== undefined) cambios.permisos = normalizarPermisos(datos.permisos);

  const actualizado = await repositorio.actualizarUsuario(id, cambios);
  await repositorio.guardarAlcanceUsuario(id, alcance);

  const definitivo = {
    ...actualizado,
    ...alcance,
    puedeEscribir: puedeEscribirDe({ ...actualizado, ...cambios }),
    rolPersonalizado: especial || actualizado?.rolPersonalizado || null
  };
  return publico({
    ...definitivo,
    permisosEfectivos: permisosDe(definitivo)
  });
}
