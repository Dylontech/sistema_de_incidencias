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
  ESTADOS_REPUBLICA,
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
import {
  normalizarPermisos,
  overridesDesdeLista,
  permisosDe,
  permisosFueraDeAlcance,
  tienePermiso
} from './permisos.service.js';
import * as claves from './claves.service.js';
import { rolPropioActivo } from './roles.service.js';
import { cifrarPassword, descifrarPassword, passwordTemporal } from '../utils/cifrado.js';
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

/**
 * Solo la administración cambia contraseñas. El personal las solicita desde
 * «Mi cuenta» y el administrador de su ámbito las restablece.
 */
function exigirPuedeCambiarPassword(actor) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido(
      'Solo la administración puede cambiar contraseñas. Solicita el cambio desde «Mi cuenta».'
    );
  }
}

/**
 * Cambiar la matriz de permisos de una cuenta es exclusivo de la administración
 * y nadie puede conceder permisos que no tenga (salvo el admin maestro).
 */
function exigirPuedeEditarPermisos(actor, permisos) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo la administración puede cambiar los permisos de una cuenta');
  }
  const concedidos = Object.entries(permisos || {})
    .filter(([, valor]) => valor === true)
    .map(([permiso]) => permiso);
  const fuera = permisosFueraDeAlcance(actor, concedidos);
  if (fuera.length) {
    throw AppError.prohibido(
      `No puedes conceder permisos que tú no tienes: ${fuera.join(', ')}`
    );
  }
}

async function exigirUsernameLibre(repositorio, username) {
  if (await repositorio.usuarioPorUsername(username)) {
    throw AppError.conflicto('Ya existe un usuario con ese nombre de acceso');
  }
}

/**
 * El correo es el canal de avisos y no puede repetirse entre cuentas.
 * Se comprueba antes de escribir y, además, la base lo respalda con un índice
 * único; los choques por concurrencia se traducen a un 409 legible.
 */
async function exigirCorreoLibre(repositorio, correo, { exceptoId = null } = {}) {
  if (!correo) return;
  const existente = await repositorio.usuarioPorCorreo(correo);
  if (existente && existente.id !== exceptoId) {
    throw AppError.conflicto(
      'Ese correo ya está registrado en otra cuenta. Usa otro correo para esta cuenta.'
    );
  }
}

/** Traduce un choque del índice único de MySQL a un conflicto entendible. */
function conflictoPorDuplicado(error) {
  if (error?.code !== 'ER_DUP_ENTRY') return null;
  const mensaje = String(error.message || '');
  if (/correo/i.test(mensaje)) {
    return AppError.conflicto(
      'Ese correo ya está registrado en otra cuenta. Usa otro correo para esta cuenta.'
    );
  }
  if (/username/i.test(mensaje)) {
    return AppError.conflicto('Ya existe un usuario con ese nombre de acceso');
  }
  return AppError.conflicto('Ya existe una cuenta con esos datos');
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
  // Los estados se validan contra las 32 entidades, no solo contra los que ya
  // tienen municipios importados: una cuenta puede quedar preparada para un
  // estado cuyo catálogo se importe después.
  const estadosValidos = new Set([
    ...ESTADOS_REPUBLICA,
    ...catalogo.map((m) => m.estado)
  ]);

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
  // Un funcionario o soporte con un permiso CRUD de usuarios (o el paraguas
  // `gestionar_usuarios`) puede crear/editar cuentas, pero solo dentro de su
  // ámbito y nunca administradores. La ruta ya exige el permiso concreto.
  const porPermiso = [
    'gestionar_usuarios',
    'crear_usuarios',
    'editar_usuarios',
    'eliminar_usuarios'
  ].some((permiso) => tienePermiso(actor, permiso));
  if (!esAdminTerritorial(actor) && !porPermiso) {
    throw AppError.prohibido('No puedes gestionar cuentas del personal');
  }
  if (ROLES_ADMIN.includes(rol)) {
    throw AppError.prohibido('Solo el administrador maestro puede gestionar administradores');
  }
  // V2.11: quien no es administrador solo crea y edita cuentas de funcionario.
  // Un funcionario con `crear_usuarios` no puede abrir cuentas de auditor,
  // soporte ni enlace, aunque tenga el permiso CRUD.
  if (!esAlgunaAdmin(actor) && rol !== 'funcionario') {
    throw AppError.prohibido(
      'Solo puedes crear o editar cuentas de funcionario dentro de tus municipios'
    );
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

/**
 * Alta de una cuenta de personal.
 *
 * Si llega `claveId`, la clave manda: define rol, territorio y permisos. Así
 * el administrador puede preparar una clave (por ejemplo Maravatío + «ver
 * usuarios») y crear la cuenta sin volver a configurar nada a mano.
 */
export async function crear(repositorio, datos = {}, { actor = null } = {}) {
  const actorAdmin = !actor || esAlgunaAdmin(actor);
  // V2.11.2: las cuentas las crea la administración. Un funcionario con
  // `crear_usuarios` rellena una **solicitud de alta** y la administración la
  // aprueba; así no puede elegir rol, territorio ni permisos.
  if (actor && !actorAdmin) {
    throw AppError.prohibido(
      'Solo la administración crea cuentas. Envía una solicitud de alta desde el listado de usuarios.'
    );
  }

  const entrada = validarEntrada(datos);
  const clave = datos.claveId
    ? await claves.validarParaCuenta(repositorio, actor, datos.claveId)
    : null;
  const rolPropio = entrada.rolPropioId
    ? await rolPropioActivo(repositorio, entrada.rolPropioId)
    : null;
  if (rolPropio && clave) {
    throw AppError.solicitudInvalida('Una cuenta creada desde una clave no lleva rol propio');
  }
  const rol = !actorAdmin
    ? 'funcionario'
    : rolPropio
      ? rolPropio.rolPlantilla
      : clave?.rolSugerido && ROLES_PERSONAL.includes(clave.rolSugerido)
        ? clave.rolSugerido
        : entrada.rol;

  const especial = await rolEspecial(repositorio, entrada.rolPersonalizadoId);
  if (especial && especial.rolBase !== rol) {
    throw AppError.solicitudInvalida(
      `El rol especial «${especial.nombre}» solo aplica al rol base ${especial.rolBase}`
    );
  }
  await exigirUsernameLibre(repositorio, entrada.username);
  await exigirCorreoLibre(repositorio, entrada.correo);
  const password = exigirPassword(datos.password);

  let alcance;
  if (!actorAdmin) {
    // El territorio de la cuenta nueva es siempre el del funcionario que la
    // crea: no puede elegir estados ni municipios.
    const propio = alcanceDe(actor);
    const municipiosPropios = propio.municipios ? [...propio.municipios] : [];
    if (!municipiosPropios.length) {
      throw AppError.prohibido(
        'Necesitas tener municipios asignados para crear cuentas de funcionario'
      );
    }
    alcance = await validarAlcance(repositorio, 'funcionario', {
      municipios: municipiosPropios,
      estados: []
    });
  } else {
    alcance = clave
      ? await validarAlcance(repositorio, rol, {
          municipios: clave.municipios,
          estados: clave.estados
        })
      : await validarAlcance(repositorio, rol, {
          municipios: datos.municipios ?? (entrada.municipioId ? [entrada.municipioId] : []),
          estados: datos.estados ?? []
        });
  }

  if (actor) {
    await exigirPuedeGestionar(repositorio, actor, {
      rol,
      municipios: alcance.municipios,
      estados: alcance.estados
    });
  }

  const usuario = construirUsuario({
    username: entrada.username,
    nombre: entrada.nombre,
    correo: entrada.correo ?? null,
    telefono: entrada.telefono ?? null,
    rol,
    municipioId: alcance.municipios[0] || null,
    passwordHash: await hashearPassword(password),
    passwordCifrada: cifrarPassword(password),
    rolPersonalizadoId: especial?.id || null,
    rolPropioId: rolPropio?.id || null,
    puedeEscribir: ROLES_LECTURA.includes(rol) ? false : rol !== 'soporte'
  });

  // El panel puede crear la cuenta ya inactiva o con permisos a medida.
  if (datos.activo === false) usuario.activo = false;
  if (Array.isArray(clave?.permisos)) {
    // La clave define exactamente lo que podrá hacer la cuenta: los permisos
    // que no estén en la clave quedan denegados de forma explícita.
    usuario.permisos = overridesDesdeLista(clave.permisos);
  } else if (datos.permisos !== undefined) {
    const normalizados = normalizarPermisos(datos.permisos);
    if (normalizados) {
      if (actor) exigirPuedeEditarPermisos(actor, normalizados);
      usuario.permisos = normalizados;
    }
  }

  let creado;
  try {
    creado = await repositorio.crearUsuario(usuario);
  } catch (error) {
    throw conflictoPorDuplicado(error) || error;
  }
  await repositorio.guardarAlcanceUsuario(creado.id, alcance);

  return publico({
    ...creado,
    ...alcance,
    rolPersonalizado: especial || null,
    rolPropio: rolPropio || null,
    permisosEfectivos: permisosDe({
      ...creado,
      rolPersonalizado: especial || null,
      rolPropio: rolPropio || null,
      rolConfig: null
    })
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
  // V2.11.1: un funcionario con `editar_usuarios` solo cambia el nombre
  // completo. Cualquier intento de tocar rol, territorio, permisos, correo o
  // contraseña responde 403 aunque el cliente lo envíe a mano.
  if (actor && !esAlgunaAdmin(actor)) {
    const prohibidos = [
      'rol',
      'rolPropioId',
      'rolPersonalizadoId',
      'municipios',
      'estados',
      'puedeEscribir',
      'activo',
      'permisos',
      'password',
      'correo',
      'telefono'
    ].filter((campo) => datos[campo] !== undefined);
    if (prohibidos.length) {
      throw AppError.prohibido(
        'Solo puedes cambiar el nombre completo. El rol, el territorio, los permisos, el correo y la contraseña los gestiona la administración.'
      );
    }
  }
  if (ROLES_ADMIN.includes(actual.rol) && !esAdminMaestro(actor)) {
    throw AppError.prohibido('Solo el administrador maestro puede editar administradores');
  }

  const cambios = validarEntrada(datos, { parcial: true });
  delete cambios.username;
  delete cambios.pseudonimo;
  if (cambios.correo !== undefined) {
    await exigirCorreoLibre(repositorio, cambios.correo, { exceptoId: id });
  }
  const especial = await rolEspecial(repositorio, cambios.rolPersonalizadoId);
  const rolPropio =
    cambios.rolPropioId !== undefined
      ? await rolPropioActivo(repositorio, cambios.rolPropioId)
      : null;

  const rol = rolPropio ? rolPropio.rolPlantilla : cambios.rol || actual.rol;
  if (rolPropio && cambios.rol && cambios.rol !== rolPropio.rolPlantilla) {
    throw AppError.solicitudInvalida(
      `El rol propio «${rolPropio.etiqueta}» pertenece a la plantilla ${rolPropio.rolPlantilla}`
    );
  }
  if (rolPropio) cambios.rol = rolPropio.rolPlantilla;
  if (cambios.rolPropioId !== undefined) cambios.rolPropioId = rolPropio?.id || null;
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

  if (datos.password) {
    exigirPuedeCambiarPassword(actor);
    const limpia = exigirPassword(datos.password);
    cambios.passwordHash = await hashearPassword(limpia);
    cambios.passwordCifrada = cifrarPassword(limpia);
  }
  if (datos.permisos !== undefined) {
    const normalizados = normalizarPermisos(datos.permisos);
    if (normalizados) {
      exigirPuedeEditarPermisos(actor, normalizados);
      cambios.permisos = normalizados;
    }
  }

  let actualizado;
  try {
    actualizado = await repositorio.actualizarUsuario(id, cambios);
  } catch (error) {
    throw conflictoPorDuplicado(error) || error;
  }
  await repositorio.guardarAlcanceUsuario(id, alcance);

  const definitivo = {
    ...actualizado,
    ...alcance,
    puedeEscribir: puedeEscribirDe({ ...actualizado, ...cambios }),
    rolPersonalizado: especial || actualizado?.rolPersonalizado || null,
    rolPropio: rolPropio || actualizado?.rolPropio || null
  };
  return publico({
    ...definitivo,
    permisosEfectivos: permisosDe(definitivo)
  });
}

/**
 * Baja lógica de una cuenta del personal.
 *
 * No se borra la fila porque es autora de reportes, historial y auditoría: se
 * desactiva, el middleware rechaza sus tokens y deja de aparecer como activa.
 * Las mismas salvaguardas que la edición impiden quitarse el acceso o dejar el
 * sistema sin administrador maestro.
 */
export async function eliminar(repositorio, actor, id) {
  const actual = await repositorio.usuarioPorId(id);
  if (!actual) throw AppError.noEncontrado('Usuario no encontrado');
  if (!ROLES_PERSONAL.includes(actual.rol)) {
    throw AppError.prohibido('Esa cuenta no es del personal del sistema');
  }
  // Dar de baja una cuenta es de la administración. El funcionario puede
  // solicitarla desde el panel (solicitudes de baja).
  if (actor && !esAlgunaAdmin(actor)) {
    throw AppError.prohibido(
      'Solo la administración puede dar de baja una cuenta. Envía una solicitud de baja desde el listado.'
    );
  }
  if (ROLES_ADMIN.includes(actual.rol) && !esAdminMaestro(actor)) {
    throw AppError.prohibido('Solo el administrador maestro puede desactivar administradores');
  }
  if (actor?.id === actual.id || actor?.username === actual.username) {
    throw AppError.conflicto('No puedes desactivar tu propia cuenta');
  }

  const asignacion = await repositorio.alcanceDeUsuario(id);
  await exigirPuedeGestionar(repositorio, actor, {
    rol: actual.rol,
    municipios: asignacion.municipios.length
      ? asignacion.municipios
      : actual.municipioId
        ? [actual.municipioId]
        : [],
    estados: asignacion.estados
  });

  if (
    actual.rol === 'admin' &&
    (await administradoresActivos(repositorio, { exceptoId: id })) === 0
  ) {
    throw AppError.conflicto('Debe quedar al menos un administrador activo');
  }

  const actualizado = await repositorio.actualizarUsuario(id, { activo: false });
  return publico(actualizado);
}

/**
 * Devuelve a la vida una cuenta dada de baja (baja lógica).
 *
 * Solo la administración reactiva: el alta de una cuenta nueva por parte de un
 * funcionario pasa por una solicitud, pero recuperar una cuenta existente
 * conserva su historial y su territorio, así que requiere revisión.
 */
export async function reactivar(repositorio, actor, id) {
  const actual = await repositorio.usuarioPorId(id);
  if (!actual) throw AppError.noEncontrado('Usuario no encontrado');
  if (!ROLES_PERSONAL.includes(actual.rol)) {
    throw AppError.prohibido('Esa cuenta no es del personal del sistema');
  }
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido(
      'Solo la administración puede reactivar cuentas. Si necesitas una cuenta nueva, envía una solicitud de alta.'
    );
  }
  if (ROLES_ADMIN.includes(actual.rol) && !esAdminMaestro(actor)) {
    throw AppError.prohibido('Solo el administrador maestro puede reactivar administradores');
  }
  if (actual.activo !== false) {
    throw AppError.conflicto('Esa cuenta ya está activa');
  }

  const asignacion = await repositorio.alcanceDeUsuario(id);
  await exigirPuedeGestionar(repositorio, actor, {
    rol: actual.rol,
    municipios: asignacion.municipios.length
      ? asignacion.municipios
      : actual.municipioId
        ? [actual.municipioId]
        : [],
    estados: asignacion.estados
  });

  const actualizado = await repositorio.actualizarUsuario(id, { activo: true });
  return publico({ ...actualizado, ...asignacion });
}

/* ------------------------------------------------------------------------- */
/* V2.11 — contraseñas consultables y restablecimiento                       */
/* ------------------------------------------------------------------------- */

/**
 * La consulta de contraseñas es de la administración y respeta el territorio:
 * un admin municipal solo ve las cuentas de su municipio y nunca las de
 * administración (esas solo las ve el maestro).
 */
async function exigirPuedeConsultarCuenta(repositorio, actor, cuenta) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo la administración puede consultar contraseñas');
  }
  if (esAdminMaestro(actor)) return;
  if (ROLES_ADMIN.includes(cuenta.rol)) {
    throw AppError.prohibido(
      'Solo el administrador maestro puede consultar contraseñas de administradores'
    );
  }
  const asignacion = await repositorio.alcanceDeUsuario(cuenta.id);
  const catalogo = await repositorio.todosMunicipios();
  const estadoDeMunicipio = new Map(catalogo.map((m) => [String(m.id), m.estado]));
  if (!visiblePara(actor, cuenta, asignacion, estadoDeMunicipio)) {
    throw AppError.prohibido('Esa cuenta está fuera de tu ámbito territorial');
  }
}

/**
 * Devuelve la contraseña en claro de una cuenta, descifrando la copia guardada.
 *
 * Las cuentas anteriores a V2.11 no tienen copia (bcrypt es irreversible), así
 * que se responde 409 con la instrucción de restablecerla.
 */
export async function revelarPassword(repositorio, actor, id) {
  if (!tienePermiso(actor, 'revelar_password_usuarios')) {
    throw AppError.prohibido('No tienes permiso para consultar contraseñas');
  }
  const cuenta = await repositorio.usuarioPorId(id);
  if (!cuenta) throw AppError.noEncontrado('Usuario no encontrado');
  await exigirPuedeConsultarCuenta(repositorio, actor, cuenta);

  const password = descifrarPassword(await repositorio.passwordCifradaDeUsuario(id));
  if (!password) {
    throw new AppError(
      409,
      'Esta cuenta se creó antes de que se guardara la copia consultable. Restablécele una contraseña nueva.',
      { codigo: 'password_no_consultable', puedeRestablecer: true }
    );
  }
  return { usuario: publico(cuenta), password };
}

/**
 * Restablece la contraseña de una cuenta. Sin `datos.password` se genera una
 * temporal legible; se devuelve en claro una única vez para entregarla en mano.
 */
export async function restablecerPassword(repositorio, actor, id, datos = {}) {
  if (!tienePermiso(actor, 'revelar_password_usuarios')) {
    throw AppError.prohibido('No tienes permiso para restablecer contraseñas');
  }
  const cuenta = await repositorio.usuarioPorId(id);
  if (!cuenta) throw AppError.noEncontrado('Usuario no encontrado');
  if (!ROLES_PERSONAL.includes(cuenta.rol) && !esAdminMaestro(actor)) {
    throw AppError.prohibido('Solo el administrador maestro puede restablecer cuentas ciudadanas');
  }
  await exigirPuedeConsultarCuenta(repositorio, actor, cuenta);

  const limpia = datos.password ? exigirPassword(datos.password) : passwordTemporal();
  await repositorio.actualizarUsuario(id, {
    passwordHash: await hashearPassword(limpia),
    passwordCifrada: cifrarPassword(limpia)
  });
  return { usuario: publico(cuenta), password: limpia, generada: !datos.password };
}
