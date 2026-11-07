/** Claves de acceso para conjuntos de municipios. */
import crypto from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { nuevoCodigoClave } from '../utils/claves.js';
import { config } from '../config/index.js';
import { ESTADOS_REPUBLICA } from '../config/constantes.js';
import { alcanceDe, esAdminMaestro, esAlgunaAdmin } from './alcance.service.js';
import {
  normalizarListaPermisos,
  permisosBaseDeRol,
  permisosDe
} from './permisos.service.js';
import { emitir } from './notificaciones.service.js';

const ROLES_CLAVE = ['cuadrilla', 'funcionario', 'auditor', 'enlace_estatal', 'enlace_federal', 'soporte'];

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(`${config.jwt.secret}:${ip}`).digest('hex').slice(0, 32);
}

function codigoExpirado(clave) {
  return Boolean(clave.expiraEn) && new Date(clave.expiraEn).getTime() <= Date.now();
}

function agotada(clave) {
  return clave.usosMaximos !== null && clave.usosMaximos !== undefined && clave.usos >= clave.usosMaximos;
}

/** Municipios que cubre la clave, expandiendo sus estados con el catálogo. */
export async function municipiosCubiertos(repositorio, clave = {}) {
  const municipios = new Set((clave.municipios || []).map(String));
  const estados = [...new Set((clave.estados || []).filter(Boolean).map(String))];
  if (estados.length) {
    const catalogo = await repositorio.municipiosLigeros();
    for (const municipio of catalogo) {
      if (estados.includes(String(municipio.estado))) municipios.add(String(municipio.id));
    }
  }
  return [...municipios];
}

/** Municipios que forman la adscripción de una cuenta. */
export async function municipiosDeAdscripcion(
  repositorio,
  { municipios = [], estados = [] } = {}
) {
  const ids = new Set((municipios || []).filter(Boolean).map(String));
  const entidades = [...new Set((estados || []).filter(Boolean).map(String))];
  if (entidades.length) {
    const catalogo = await repositorio.municipiosLigeros();
    for (const municipio of catalogo) {
      if (entidades.includes(String(municipio.estado))) ids.add(String(municipio.id));
    }
  }
  return [...ids];
}

/**
 * La clave debe cubrir toda la adscripción de la cuenta. Si no, se rechaza el
 * alta, el vínculo y el inicio de sesión (por ejemplo, clave de Morelia para
 * un funcionario de Maravatío).
 */
export async function exigirCobertura(repositorio, clave, adscripcion = {}) {
  const adscritos = await municipiosDeAdscripcion(repositorio, adscripcion);
  if (!adscritos.length) {
    throw new AppError(400, 'La cuenta necesita un municipio o estado de adscripción', [
      { codigo: 'adscripcion_requerida' }
    ]);
  }
  const cubiertos = new Set(await municipiosCubiertos(repositorio, clave));
  const faltantes = adscritos.filter((id) => !cubiertos.has(String(id)));
  if (faltantes.length) {
    throw new AppError(403, 'La clave no cubre el municipio o ámbito de la cuenta', [
      { codigo: 'clave_no_corresponde', municipios: faltantes }
    ]);
  }
  return true;
}

/** Cupo restante de la clave (null = sin límite). */
export async function cupoDisponible(repositorio, clave) {
  if (!clave || clave.usosMaximos === null || clave.usosMaximos === undefined) return null;
  const activos = await repositorio.contarCuentasActivasDeClave(clave.id);
  return Math.max(0, Number(clave.usosMaximos) - activos);
}

/** ¿La clave puede seguir abriendo sesiones? (no mira el límite de usos) */
export function claveVigente(clave) {
  return Boolean(clave) && clave.activa !== false && !codigoExpirado(clave);
}

/**
 * Territorio efectivo de una clave.
 *
 * Si cubre estados completos se usa el estado (así incluye municipios
 * importados después); si solo cubre municipios, se usa la lista concreta.
 */
export function territorioDeClave(clave = {}) {
  const estados = [...new Set((clave.estados || []).filter(Boolean).map(String))];
  if (estados.length) return { municipios: [], estados };
  const municipios = [...new Set((clave.municipios || []).filter(Boolean).map(String))];
  return { municipios, estados: [] };
}

/**
 * Recorta un contexto de usuario a lo que autoriza la clave.
 *
 * - El territorio de la clave manda sobre el de la cuenta.
 * - Los permisos efectivos se cruzan con los de la clave (si la clave no
 *   declara permisos, se conservan los de la cuenta por compatibilidad).
 */
export function aplicarClaveAUsuario(usuario = {}, clave = {}) {
  const permisosCuenta = Array.isArray(usuario.permisos)
    ? usuario.permisos
    : permisosDe(usuario);
  const territorio = territorioDeClave(clave);
  const municipiosCuenta = (usuario.municipios || []).map(String);
  const estadosCuenta = (usuario.estados || []).map(String);
  const municipiosClave = (territorio.municipios || []).map(String);
  const estadosClave = (territorio.estados || []).map(String);

  // La clave es un techo, no una ampliación: si la cuenta ya tenía territorio,
  // se conserva solo la parte que la clave autoriza. Así, retirar un municipio
  // de la cuenta surte efecto aunque la clave cubra más municipios.
  let municipios;
  let estados;
  if (municipiosCuenta.length || estadosCuenta.length) {
    municipios = municipiosCuenta.length
      ? municipiosCuenta.filter((id) => !municipiosClave.length || municipiosClave.includes(id))
      : municipiosClave;
    estados = estadosClave.length
      ? estadosCuenta.filter((estado) => estadosClave.includes(estado))
      : estadosCuenta;
  } else {
    municipios = municipiosClave;
    estados = estadosClave;
  }

  // La clave es la autorización: si declara permisos, esa lista manda (puede
  // conceder una excepción como «crear usuarios» a un funcionario). Si no los
  // declara, se conservan los de la cuenta por compatibilidad.
  const permisos = Array.isArray(clave.permisos)
    ? normalizarListaPermisos(clave.permisos)
    : permisosCuenta;
  return {
    ...usuario,
    claveId: clave.id || usuario.claveId || null,
    municipios,
    estados,
    permisos
  };
}

export async function listar(repositorio, actor = null) {
  const claves = await repositorio.todasLasClaves();
  let visibles = claves;
  if (actor && !esAdminMaestro(actor)) {
    const alcance = alcanceDe(actor);
    if (alcance.todos) {
      visibles = claves;
    } else if (alcance.municipios) {
      visibles = claves.filter((c) => (c.municipios || []).some((id) => alcance.municipios.has(id)));
    } else if (alcance.estados) {
      const catalogo = await repositorio.municipiosLigeros();
      const porId = new Map(catalogo.map((m) => [m.id, m.estado]));
      visibles = claves.filter((c) =>
        (c.municipios || []).some((id) => alcance.estados.has(porId.get(id)))
      );
    } else {
      visibles = [];
    }
  }

  if (!visibles.length) return [];
  const ids = visibles.map((c) => c.id);
  const [usuarios, sesiones, notificaciones] = await Promise.all([
    repositorio.usuariosDeClaves(ids),
    repositorio.listarSesiones({ limite: 500 }),
    repositorio.notificacionesDeClaves(ids)
  ]);
  return visibles.map((clave) => {
    const propias = sesiones.filter((sesion) => sesion.claveId === clave.id);
    const vinculados = usuarios[clave.id] || [];
    const activos = vinculados.filter((cuenta) => cuenta.activo !== false).length;
    return {
      ...clave,
      usuariosVinculados: vinculados,
      usos: activos,
      cupoDisponible:
        clave.usosMaximos === null || clave.usosMaximos === undefined
          ? null
          : Math.max(0, Number(clave.usosMaximos) - activos),
      configuracionPendiente: !clave.expiraEn || clave.usosMaximos === null || clave.usosMaximos === undefined,
      sesionesActivas: propias.length,
      sesiones: propias,
      notificaciones: notificaciones[clave.id] || { activo: true, municipios: [] }
    };
  });
}

export async function crear(repositorio, actor, datos = {}) {
  // V2.11: una clave autoriza territorio y permisos, así que solo la crea una
  // cuenta de administración. Un funcionario puede usar la suya, nunca generar
  // otra (ni para sí mismo ni para nadie).
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo los administradores pueden generar claves de acceso');
  }
  const nombre = String(datos.nombre || '').trim();
  const municipios = [...new Set((datos.municipios || []).filter(Boolean).map(String))];
  const estados = [...new Set((datos.estados || []).filter(Boolean).map(String))];
  if (!nombre) throw AppError.solicitudInvalida('Escribe un nombre para la clave');
  if (!municipios.length && !estados.length) {
    throw AppError.solicitudInvalida('Elige al menos un municipio o un estado');
  }

  const catalogo = await repositorio.municipiosLigeros();
  const existentes = new Set(catalogo.map((m) => String(m.id)));
  if (municipios.some((id) => !existentes.has(id))) {
    throw AppError.solicitudInvalida('Alguno de los municipios no existe');
  }
  const estadosValidos = new Set([
    ...ESTADOS_REPUBLICA,
    ...catalogo.map((m) => m.estado)
  ]);
  if (estados.some((estado) => !estadosValidos.has(estado))) {
    throw AppError.solicitudInvalida('Alguno de los estados no existe');
  }
  const estadosSinMunicipios = estados.filter(
    (estado) => !catalogo.some((m) => m.estado === estado)
  );
  if (estadosSinMunicipios.length) {
    throw AppError.solicitudInvalida(
      `El estado ${estadosSinMunicipios.join(', ')} todavía no tiene municipios cargados`
    );
  }
  const deEstados = catalogo
    .filter((m) => estados.includes(m.estado))
    .map((m) => String(m.id));
  const todosMunicipios = [...new Set([...municipios, ...deEstados])];

  // Coherencia entre el rol sugerido y el territorio: un enlace estatal o
  // federal entra por estado, no por municipios sueltos.
  if (
    (datos.rolSugerido === 'enlace_estatal' || datos.rolSugerido === 'enlace_federal') &&
    !estados.length
  ) {
    throw AppError.solicitudInvalida('Elige al menos un estado para el enlace');
  }

  // Un administrador territorial solo genera claves de su ámbito.
  if (actor && !esAdminMaestro(actor)) {
    const alcance = alcanceDe(actor);
    if (alcance.municipios) {
      if (todosMunicipios.some((id) => !alcance.municipios.has(id))) {
        throw AppError.prohibido('Alguno de los municipios está fuera de tu ámbito');
      }
    } else if (alcance.estados) {
      if (estados.some((estado) => !alcance.estados.has(estado))) {
        throw AppError.prohibido('Alguno de los estados está fuera de tu ámbito');
      }
      const porId = new Map(catalogo.map((m) => [String(m.id), m.estado]));
      if (todosMunicipios.some((id) => !alcance.estados.has(porId.get(id)))) {
        throw AppError.prohibido('Alguno de los municipios está fuera de tu ámbito');
      }
    } else {
      throw AppError.prohibido('No tienes ámbito para generar claves');
    }
  }

  const rolSugerido = ROLES_CLAVE.includes(datos.rolSugerido) ? datos.rolSugerido : null;
  const modo = datos.modo === 'unica' ? 'unica' : 'compartida';
  const permisosPedidos = normalizarListaPermisos(datos.permisos);
  // Si no se envían permisos, la clave hereda la matriz del rol sugerido. Si
  // tampoco hay rol, queda sin recorte (compatibilidad con claves antiguas).
  const permisos =
    permisosPedidos === undefined
      ? rolSugerido
        ? permisosBaseDeRol(rolSugerido)
        : null
      : permisosPedidos;
  if (
    datos.usosMaximos === null ||
    datos.usosMaximos === undefined ||
    datos.usosMaximos === ''
  ) {
    throw AppError.solicitudInvalida('El cupo de funcionarios es obligatorio');
  }
  const usosMaximos = Number(datos.usosMaximos);
  if (!Number.isInteger(usosMaximos) || usosMaximos < 1) {
    throw AppError.solicitudInvalida('El cupo de funcionarios debe ser un entero mayor que cero');
  }
  if (!datos.expiraEn) {
    throw AppError.solicitudInvalida('La fecha de vencimiento de la clave es obligatoria');
  }
  const expiraEn = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(String(datos.expiraEn))
      ? `${datos.expiraEn}T23:59:59`
      : datos.expiraEn
  );
  if (Number.isNaN(expiraEn.getTime())) {
    throw AppError.solicitudInvalida('La fecha de expiración no es válida');
  }
  if (expiraEn.getTime() <= Date.now()) {
    throw AppError.solicitudInvalida('La fecha de expiración de la clave debe ser futura');
  }

  // Reintenta si el código aleatorio coincide con otro.
  for (let intento = 0; intento < 5; intento++) {
    const codigo = nuevoCodigoClave();
    if (await repositorio.claveAccesoPorCodigo(codigo)) continue;

    const clave = {
      id: nuevoId(),
      codigo,
      nombre,
      rolSugerido,
      modo,
      activa: true,
      usosMaximos,
      usos: 0,
      expiraEn: expiraEn.toISOString(),
      activadaEn: null,
      activadaPorUsuarioId: null,
      renovadaDeId: datos.renovadaDeId || null,
      creadoPor: actor?.username || null,
      creadoEn: new Date().toISOString(),
      revocadaEn: null,
      notificacionesActivas: true,
      permisos,
      municipios: todosMunicipios,
      estados
    };
    const creada = await repositorio.crearClaveAcceso(clave);
    await emitir(repositorio, {
      evento: 'clave_creada',
      titulo: '🔑 Clave de acceso creada',
      mensaje: `Se creó la clave «${nombre}» para ${[municipios.length ? `${municipios.length} municipio(s)` : '', estados.length ? `${estados.length} estado(s)` : ''].filter(Boolean).join(' y ') || 'todo el territorio'}.`,
      entidadTipo: 'clave',
      entidadId: creada.id,
      url: '/?admin=claves',
      claveDedupe: `clave_creada:${creada.id}`
    }).catch(() => {});
    return creada;
  }

  throw AppError.errorInterno('No se pudo generar una clave única');
}

/**
 * Clave de acceso pensada para una cuenta concreta: cubre justo los municipios
 * que tiene asignados. Se usa al crear o editar un usuario del panel para no
 * obligar al administrador a ir a la pestaña «Claves» a mano.
 *
 * Devuelve `null` cuando la cuenta no tiene municipios (un administrador
 * global, por ejemplo): en ese caso no hay nada que proteger con la clave.
 */
export async function crearParaCuenta(repositorio, actor, cuenta, { usosMaximos, expiraEn } = {}) {
  const municipios = cuenta.municipios?.length
    ? cuenta.municipios
    : cuenta.municipioId
      ? [cuenta.municipioId]
      : [];
  const estados = Array.isArray(cuenta.estados) ? cuenta.estados : [];
  if (!municipios.length && !estados.length) return null;

  const vigencia =
    expiraEn ||
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const clave = await crear(repositorio, actor, {
    nombre: `Acceso de ${cuenta.nombre || cuenta.username}`,
    rolSugerido: ROLES_CLAVE.includes(cuenta.rol) ? cuenta.rol : null,
    // La clave documenta exactamente los permisos que tendrá la cuenta y los
    // vuelve a aplicar (recortados al territorio de la clave) al iniciar sesión.
    permisos: Array.isArray(cuenta.permisosEfectivos)
      ? cuenta.permisosEfectivos
      : permisosBaseDeRol(cuenta.rol),
    municipios,
    estados,
    modo: 'unica',
    usosMaximos: 1,
    expiraEn: vigencia,
    renovadaDeId: cuenta.claveId || null
  });

  // La clave queda ligada a la cuenta desde que se genera. Si la cuenta tenía
  // otra clave, se retira el vínculo anterior para que su cupo y su lista de
  // usuarios no sigan contando una cuenta que ya usa la nueva.
  if (cuenta.claveId && String(cuenta.claveId) !== String(clave.id)) {
    await repositorio.desvincularCuentaDeClave(cuenta.claveId, cuenta.id);
  }
  await repositorio.actualizarUsuario(cuenta.id, {
    claveId: clave.id,
    claveActivadaEn: null,
    claveVigenteHasta: null,
    claveObligatoria: true
  });
  await repositorio.vincularCuentaAClave(clave.id, cuenta.id);
  return clave;
}

/**
 * Vincula una clave existente o genera una nueva para una cuenta que aún no
 * tiene acceso. Es la vía de rescate para cuentas creadas sin clave.
 */
export async function vincularACuenta(
  repositorio,
  actor,
  cuentaId,
  { claveId = null, generarClave = false, claveExpiraEn = null } = {}
) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo la administración puede vincular claves de acceso');
  }
  const cuenta = await repositorio.usuarioPorId(cuentaId);
  if (!cuenta) throw AppError.noEncontrado('Usuario no encontrado');
  if (!ROLES_CLAVE.includes(cuenta.rol)) {
    throw AppError.prohibido('Esa cuenta no usa clave de activación');
  }
  const claveExistente = cuenta.claveId
    ? await repositorio.claveAccesoPorId(cuenta.claveId)
    : null;
  if (claveExistente) {
    throw AppError.conflicto('La cuenta ya tiene una clave. Usa la renovación para cambiarla.');
  }
  if (cuenta.claveId && !claveExistente) {
    // Referencia huérfana de una clave eliminada: se limpia para poder
    // rescatar la cuenta con una clave nueva.
    await repositorio.actualizarUsuario(cuenta.id, {
      claveId: null,
      claveActivadaEn: null,
      claveVigenteHasta: null,
      claveObligatoria: true
    });
  }
  const asignacion = await repositorio.alcanceDeUsuario(cuenta.id);
  const adscripcion = {
    municipios: asignacion.municipios.length
      ? asignacion.municipios
      : cuenta.municipioId
        ? [cuenta.municipioId]
        : [],
    estados: asignacion.estados
  };

  if (generarClave === true) {
    if (!claveExpiraEn) {
      throw AppError.solicitudInvalida('Indica la fecha de vencimiento de la clave nueva');
    }
    const clave = await crearParaCuenta(
      repositorio,
      actor,
      {
        ...cuenta,
        ...adscripcion,
        permisosEfectivos: permisosDe(cuenta)
      },
      { expiraEn: claveExpiraEn }
    );
    if (!clave) throw AppError.solicitudInvalida('La cuenta no tiene territorio para la clave');
    return { clave };
  }

  if (!claveId) {
    throw AppError.solicitudInvalida('Elige una clave existente o genera una nueva');
  }
  const clave = await validarParaCuenta(repositorio, actor, claveId, adscripcion);
  await repositorio.vincularCuentaAClave(clave.id, cuenta.id);
  await repositorio.actualizarUsuario(cuenta.id, {
    claveId: clave.id,
    claveActivadaEn: null,
    claveVigenteHasta: null,
    claveObligatoria: true
  });
  return { clave };
}

/** Convierte una fecha `YYYY-MM-DD` o ISO en Date y exige que sea futura. */
function fechaFutura(valor, mensaje) {
  const fecha = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(String(valor || '')) ? `${valor}T23:59:59` : valor
  );
  if (Number.isNaN(fecha.getTime())) {
    throw AppError.solicitudInvalida('La fecha indicada no es válida');
  }
  if (fecha.getTime() <= Date.now()) {
    throw AppError.solicitudInvalida(mensaje || 'La fecha debe ser futura');
  }
  return fecha;
}

/**
 * Completa o corrige una clave existente. Sirve para las claves antiguas que
 * se crearon sin cupo ni vencimiento: hasta completarlas no pueden asignarse.
 */
export async function actualizar(repositorio, actor, id, datos = {}) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo la administración puede modificar claves de acceso');
  }
  const clave = await repositorio.claveAccesoPorId(String(id || ''));
  if (!clave) throw AppError.noEncontrado('Clave de acceso no encontrada');
  await exigirAlcanceClave(repositorio, actor, clave);

  const cambios = {};
  if (datos.nombre !== undefined) {
    const nombre = String(datos.nombre || '').trim();
    if (!nombre) throw AppError.solicitudInvalida('Escribe un nombre para la clave');
    cambios.nombre = nombre.slice(0, 120);
  }
  if (datos.usosMaximos !== undefined) {
    const cupo = Number(datos.usosMaximos);
    if (!Number.isInteger(cupo) || cupo < 1) {
      throw AppError.solicitudInvalida('El cupo de funcionarios debe ser un entero mayor que cero');
    }
    const activas = await repositorio.contarCuentasActivasDeClave(clave.id);
    if (cupo < activas) {
      throw AppError.solicitudInvalida(
        `El cupo no puede ser menor que las ${activas} cuenta(s) ya vinculadas`
      );
    }
    cambios.usosMaximos = cupo;
  }
  if (datos.expiraEn !== undefined) {
    cambios.expiraEn = fechaFutura(
      datos.expiraEn,
      'La fecha de expiración de la clave debe ser futura'
    ).toISOString();
  }
  if (datos.activa !== undefined) {
    cambios.activa = datos.activa !== false;
    cambios.revocadaEn = cambios.activa ? null : new Date().toISOString();
  }
  const actualizada = await repositorio.actualizarClaveAcceso(clave.id, cambios);
  if (cambios.expiraEn) {
    await repositorio.eliminarAvisosClave(clave.id);
    const cuentas = await repositorio.cuentasDeClave(clave.id);
    for (const cuenta of cuentas) {
      if (cuenta.activadaEn) {
        await repositorio.actualizarUsuario(cuenta.id, {
          claveVigenteHasta: cambios.expiraEn
        });
      }
    }
  }
  return actualizada || { ...clave, ...cambios };
}

/**
 * Renueva una clave compartida: extiende su vencimiento y el de los vínculos
 * de todas las cuentas que la usan. No cambia el código para no obligar a
 * repartir uno nuevo salvo que la administración prefiera generar otra clave.
 */
export async function renovar(repositorio, actor, id, datos = {}) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo la administración puede renovar claves de acceso');
  }
  const clave = await repositorio.claveAccesoPorId(String(id || ''));
  if (!clave) throw AppError.noEncontrado('Clave de acceso no encontrada');
  await exigirAlcanceClave(repositorio, actor, clave);
  if (!datos.expiraEn) {
    throw AppError.solicitudInvalida('Indica la nueva fecha de vencimiento de la clave');
  }
  const expiraEn = fechaFutura(
    datos.expiraEn,
    'La nueva fecha de vencimiento de la clave debe ser futura'
  );
  const cambios = {
    expiraEn: expiraEn.toISOString(),
    activa: true,
    revocadaEn: null
  };
  if (
    (clave.usosMaximos === null || clave.usosMaximos === undefined) &&
    datos.usosMaximos === undefined
  ) {
    throw AppError.solicitudInvalida(
      'La clave no tiene cupo definido. Complétala antes de renovarla'
    );
  }
  if (datos.usosMaximos !== undefined) {
    const cupo = Number(datos.usosMaximos);
    if (!Number.isInteger(cupo) || cupo < 1) {
      throw AppError.solicitudInvalida('El cupo de funcionarios debe ser un entero mayor que cero');
    }
    const activas = await repositorio.contarCuentasActivasDeClave(clave.id);
    if (cupo < activas) {
      throw AppError.solicitudInvalida(
        `El cupo no puede ser menor que las ${activas} cuenta(s) ya vinculadas`
      );
    }
    cambios.usosMaximos = cupo;
  }
  const actualizada = await repositorio.actualizarClaveAcceso(clave.id, cambios);
  // Un nuevo vencimiento es un ciclo nuevo de avisos: se limpian los del ciclo
  // anterior para que vuelvan a enviarse 30/20/10/5/0 días antes.
  await repositorio.eliminarAvisosClave(clave.id);
  const cuentas = await repositorio.cuentasDeClave(clave.id);
  for (const cuenta of cuentas) {
    await repositorio.actualizarVinculoClave(clave.id, cuenta.id, {
      venceEn: expiraEn.toISOString()
    });
    // Solo se extiende la vigencia de las cuentas que ya activaron la clave.
    // Una cuenta recién creada sigue necesitando su primer inicio de sesión.
    if (cuenta.activadaEn) {
      await repositorio.actualizarUsuario(cuenta.id, {
        claveVigenteHasta: expiraEn.toISOString()
      });
    }
  }
  return { clave: actualizada || { ...clave, ...cambios }, cuentas: cuentas.length };
}

/** El propio personal pide que la administración renueve su clave. */
export async function solicitarRenovacion(repositorio, actor, { motivo = '' } = {}) {
  if (!actor || !ROLES_CLAVE.includes(actor.rol)) {
    throw AppError.prohibido('Solo las cuentas del personal con clave pueden solicitar la renovación');
  }
  const cuenta = await repositorio.usuarioPorId(actor.id);
  if (!cuenta?.claveId) {
    throw AppError.solicitudInvalida('Tu cuenta todavía no tiene una clave vinculada');
  }
  const clave = await repositorio.claveAccesoPorId(cuenta.claveId);
  if (!clave) throw AppError.noEncontrado('La clave de tu cuenta no existe');
  const abiertas = await repositorio.solicitudesRenovacionClave({
    estado: 'pendiente',
    usuarioId: cuenta.id,
    limite: 50
  });
  if (abiertas.some((s) => String(s.claveId) === String(clave.id))) {
    throw AppError.conflicto('Ya tienes una solicitud de renovación pendiente para esta clave');
  }
  const solicitud = {
    id: nuevoId(),
    claveId: clave.id,
    solicitadoPorUsuarioId: cuenta.id,
    solicitadoPor: cuenta.username || actor.username || null,
    motivo: String(motivo || '').trim().slice(0, 600),
    estado: 'pendiente',
    claveNuevaId: null,
    resueltoPor: null,
    resueltoEn: null,
    respuesta: '',
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearSolicitudRenovacionClave(solicitud);
  await emitir(repositorio, {
    evento: 'clave_renovacion_solicitada',
    titulo: 'Solicitud de renovación de clave',
    mensaje: `${solicitud.solicitadoPor || 'Una cuenta'} pide renovar la clave «${
      clave.nombre || clave.codigo
    }».`,
    municipioId: (clave.municipios || [])[0] || null,
    entidadTipo: 'clave',
    entidadId: clave.id,
    url: '/?panel=claves&renovaciones=1'
  });
  return solicitud;
}

export async function listarRenovaciones(repositorio, actor, filtros = {}) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo la administración revisa las renovaciones de claves');
  }
  const solicitudes = await repositorio.solicitudesRenovacionClave({
    estado: ['pendiente', 'aprobada', 'rechazada'].includes(filtros.estado)
      ? filtros.estado
      : null,
    limite: filtros.limite || 200
  });
  const visibles = [];
  for (const solicitud of solicitudes) {
    const clave = await repositorio.claveAccesoPorId(solicitud.claveId);
    if (!clave) continue;
    try {
      await exigirAlcanceClave(repositorio, actor, clave);
    } catch {
      continue;
    }
    visibles.push({ ...solicitud, clave });
  }
  return visibles;
}

export async function resolverRenovacion(
  repositorio,
  actor,
  id,
  { aprobar = true, expiraEn = null, respuesta = '' } = {}
) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo la administración puede resolver renovaciones de claves');
  }
  const solicitud = await repositorio.solicitudRenovacionClavePorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud de renovación no encontrada');
  if (solicitud.estado !== 'pendiente') throw AppError.conflicto('Esa solicitud ya fue resuelta');

  if (!aprobar) {
    const actualizada = await repositorio.actualizarSolicitudRenovacionClave(id, {
      estado: 'rechazada',
      resueltoPor: actor.username || null,
      resueltoEn: new Date().toISOString(),
      respuesta: String(respuesta || '').trim().slice(0, 600)
    });
    return { solicitud: actualizada, clave: null };
  }

  if (!expiraEn) {
    throw AppError.solicitudInvalida('Indica la nueva fecha de vencimiento para renovar la clave');
  }
  const resultado = await renovar(repositorio, actor, solicitud.claveId, { expiraEn });
  const actualizada = await repositorio.actualizarSolicitudRenovacionClave(id, {
    estado: 'aprobada',
    claveNuevaId: resultado.clave.id,
    resueltoPor: actor.username || null,
    resueltoEn: new Date().toISOString(),
    respuesta: String(respuesta || '').trim().slice(0, 600)
  });
  const cuentas = await repositorio.cuentasDeClave(solicitud.claveId);
  const destinatarios = [
    ...new Set(
      cuentas.map((cuenta) => cuenta.username).filter(Boolean).concat(solicitud.solicitadoPor || [])
    )
  ];
  await emitir(repositorio, {
    evento: 'clave_renovada',
    titulo: 'Clave de acceso renovada',
    mensaje: `La clave «${resultado.clave.nombre || resultado.clave.codigo}» fue renovada. Nueva vigencia: ${String(
      resultado.clave.expiraEn || ''
    ).slice(0, 10)}.`,
    paraUsuarios: destinatarios,
    municipioId: (resultado.clave.municipios || [])[0] || null,
    entidadTipo: 'clave',
    entidadId: resultado.clave.id,
    url: '/?perfil=1'
  });
  return { solicitud: actualizada, clave: resultado.clave, cuentas: resultado.cuentas };
}

/**
 * Busca una clave vigente por id y comprueba que esté dentro del ámbito del
 * actor. La usa el alta de cuentas «desde una clave».
 */
export async function validarParaCuenta(repositorio, actor, id, adscripcion = null) {
  const clave = await repositorio.claveAccesoPorId(String(id || ''));
  if (!clave) throw AppError.noEncontrado('Clave de acceso no encontrada');
  if (clave.modo === 'unica') {
    throw AppError.solicitudInvalida(
      'La clave de activación de una cuenta no se puede usar para crear otra cuenta'
    );
  }
  if (!claveVigente(clave)) {
    throw AppError.conflicto('La clave de acceso no está vigente');
  }
  if (!clave.expiraEn || clave.usosMaximos === null || clave.usosMaximos === undefined) {
    throw AppError.conflicto(
      'La clave está incompleta: define su cupo de funcionarios y su vencimiento antes de asignarla'
    );
  }
  if (adscripcion) await exigirCobertura(repositorio, clave, adscripcion);
  const disponible = await cupoDisponible(repositorio, clave);
  if (disponible !== null && disponible <= 0) {
    throw AppError.conflicto('La clave ya alcanzó su cupo de funcionarios');
  }
  await exigirAlcanceClave(repositorio, actor, clave);
  return clave;
}

/**
 * Asigna un correo institucional verificado a la clave de su municipio.
 * Si el municipio aún no tiene una clave activa, se crea una para no dejar el
 * trámite a medias.
 */
export async function asignarCorreoInstitucional(repositorio, actor, correoId) {
  const correo = await repositorio.correoInstitucionalPorId(correoId);
  if (!correo) throw AppError.noEncontrado('Correo institucional no encontrado');
  if (correo.verificado !== true) {
    throw AppError.solicitudInvalida('Verifica el correo antes de asignarlo a una clave');
  }
  if (!correo.municipioId) {
    throw AppError.solicitudInvalida('El correo debe estar asociado a un municipio');
  }

  const claves = await listar(repositorio, actor);
  let clave = claves.find(
    (c) => c.activa !== false && (c.municipios || []).includes(String(correo.municipioId))
  );
  let creada = false;
  if (!clave) {
    clave = await crear(repositorio, actor, {
      nombre: `Acceso de ${correo.municipioId}`,
      municipios: [correo.municipioId],
      rolSugerido: 'funcionario',
      usosMaximos: 20,
      expiraEn: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    });
    creada = true;
  }
  const actualizada = await repositorio.actualizarClaveAcceso(clave.id, {
    correoContacto: correo.correo,
    correoInstitucionalId: correo.id
  });
  return { clave: actualizada, creada };
}

/** Comprueba que la clave esté dentro del ámbito del actor. */
async function exigirAlcanceClave(repositorio, actor, clave) {
  if (!actor || esAdminMaestro(actor)) return;
  const alcance = alcanceDe(actor);
  if (alcance.todos) return;
  if (alcance.municipios) {
    if (!(clave.municipios || []).every((id) => alcance.municipios.has(String(id)))) {
      throw AppError.prohibido('Esa clave está fuera de tu ámbito');
    }
    return;
  }
  if (alcance.estados) {
    const catalogo = await repositorio.municipiosLigeros();
    const porId = new Map(catalogo.map((m) => [String(m.id), m.estado]));
    if (!(clave.municipios || []).every((id) => alcance.estados.has(porId.get(String(id))))) {
      throw AppError.prohibido('Esa clave está fuera de tu ámbito');
    }
    return;
  }
  throw AppError.prohibido('Esa clave está fuera de tu ámbito');
}

export async function revocar(repositorio, actor, id) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo los administradores pueden revocar claves de acceso');
  }
  const todas = await repositorio.todasLasClaves();
  const clave = todas.find((c) => c.id === id);
  if (!clave) throw AppError.noEncontrado('Clave no encontrada');
  await exigirAlcanceClave(repositorio, actor, clave);

  const revocada = await repositorio.revocarClaveAcceso(id);
  if (!revocada) throw AppError.noEncontrado('Clave no encontrada');
  const sesionesCerradas = await repositorio.cerrarSesionesPorClave(id, 'clave revocada');
  await emitir(repositorio, {
    evento: 'clave_revocada',
    titulo: '🚫 Clave de acceso revocada',
    mensaje: `La clave «${clave.nombre || clave.codigo || id}» fue revocada. Se cerraron ${sesionesCerradas} sesión(es).`,
    entidadTipo: 'clave',
    entidadId: id,
    url: '/?admin=claves',
    claveDedupe: `clave_revocada:${id}`
  }).catch(() => {});
  return { clave: revocada, sesionesCerradas };
}

/**
 * Elimina definitivamente una clave. Antes cierra todas las sesiones abiertas
 * con ella; el middleware rechazará sus tokens en la siguiente petición y el
 * canal SSE se cierra desde el controlador.
 */
export async function eliminar(repositorio, actor, id) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo los administradores pueden eliminar claves de acceso');
  }
  const todas = await repositorio.todasLasClaves();
  const clave = todas.find((c) => c.id === id);
  if (!clave) throw AppError.noEncontrado('Clave no encontrada');
  await exigirAlcanceClave(repositorio, actor, clave);

  const cuentas = await repositorio.cuentasDeClave(id);
  const sesionesCerradas = await repositorio.cerrarSesionesPorClave(id, 'clave eliminada');
  const eliminada = await repositorio.eliminarClaveAcceso(id);
  if (!eliminada) throw AppError.noEncontrado('Clave no encontrada');
  await emitir(repositorio, {
    evento: 'clave_revocada',
    titulo: '🗑️ Clave de acceso eliminada',
    mensaje: `La clave «${clave.nombre || clave.codigo || id}» se eliminó definitivamente.`,
    entidadTipo: 'clave',
    entidadId: id,
    url: '/?admin=claves',
    claveDedupe: `clave_eliminada:${id}`
  }).catch(() => {});
  // La fila de usuarios no tiene FK a la clave: hay que limpiar la referencia
  // para que la cuenta quede «sin clave vinculada» y el administrador pueda
  // asignarle una nueva sin que el login apunte a un id inexistente.
  for (const cuenta of cuentas) {
    await repositorio.actualizarUsuario(cuenta.id, {
      claveId: null,
      claveActivadaEn: null,
      claveVigenteHasta: null,
      claveObligatoria: true
    });
  }
  return { clave: eliminada, sesionesCerradas };
}

/**
 * Permiso de avisos de una clave. El alcance es un subconjunto de los
 * municipios de la clave; si queda vacío, se entiende todo su territorio.
 * Revocar los avisos NO invalida la clave para iniciar sesión.
 */
export async function configurarNotificaciones(repositorio, actor, id, datos = {}) {
  const todas = await repositorio.todasLasClaves();
  const clave = todas.find((c) => c.id === id);
  if (!clave) throw AppError.noEncontrado('Clave no encontrada');
  await exigirAlcanceClave(repositorio, actor, clave);

  const actuales = (await repositorio.notificacionesDeClaves([id]))[id] || {
    activo: true,
    municipios: []
  };
  const activo =
    datos.activo === undefined || datos.activo === null
      ? actuales.activo !== false
      : datos.activo !== false;
  const municipios = Array.isArray(datos.municipios)
    ? [...new Set(datos.municipios.filter(Boolean).map(String))]
    : actuales.municipios;

  if (municipios.length) {
    const catalogo = await repositorio.municipiosLigeros();
    const existentes = new Set(catalogo.map((m) => String(m.id)));
    if (municipios.some((municipioId) => !existentes.has(municipioId))) {
      throw AppError.solicitudInvalida('Alguno de los municipios de avisos no existe');
    }
    const deLaClave = new Set((clave.municipios || []).map(String));
    if (municipios.some((municipioId) => !deLaClave.has(municipioId))) {
      throw AppError.prohibido('Los avisos no pueden salir del territorio de la clave');
    }
  }

  const notificaciones = await repositorio.guardarNotificacionesClave(id, {
    activo,
    municipios
  });
  return {
    clave: {
      ...clave,
      notificacionesActivas: notificaciones.activo !== false
    },
    notificaciones
  };
}

/** Revoca los avisos sin tocar la validez de la clave. */
export async function revocarNotificaciones(repositorio, actor, id) {
  return configurarNotificaciones(repositorio, actor, id, { activo: false });
}

export async function reactivarNotificaciones(repositorio, actor, id) {
  return configurarNotificaciones(repositorio, actor, id, { activo: true });
}

/** Valida una clave para una entrada y devuelve el conjunto de municipios. */
export async function validar(repositorio, codigo) {
  const clave = await repositorio.claveAccesoPorCodigo(codigo);
  if (!clave) {
    throw new AppError(401, 'Clave de acceso inválida', [{ codigo: 'clave_invalida' }]);
  }
  if (clave.activa === false) {
    throw new AppError(401, 'Clave de acceso revocada', [{ codigo: 'clave_revocada' }]);
  }
  if (codigoExpirado(clave)) {
    throw new AppError(401, 'Clave de acceso expirada', [{ codigo: 'clave_expirada' }]);
  }
  // Los estados se expanden al validar: si más adelante se importan nuevos
  // municipios de ese estado, la misma clave los cubre sin recrearla.
  if (clave.estados?.length) {
    const catalogo = await repositorio.municipiosLigeros();
    const deEstados = catalogo
      .filter((municipio) => clave.estados.includes(municipio.estado))
      .map((municipio) => String(municipio.id));
    clave.municipios = [
      ...new Set([...(clave.municipios || []).map(String), ...deEstados])
    ];
  }
  return clave;
}

export async function registrarUso(repositorio, clave, { usuarioId = null, ip = null } = {}) {
  if (!clave?.id) return;
  await repositorio.registrarUsoClave(clave.id, {
    usuarioId,
    ipHash: hashIp(ip)
  });
}

/**
 * Consume la clave de activación de una cuenta.
 *
 * La clave se valida con las mismas reglas del login (vigente y con usos
 * disponibles). En modo `unica` debe ser exactamente la clave ligada a la
 * cuenta. Al consumirse se fija la fecha hasta la que la cuenta queda activa.
 */
export async function validarActivacion(
  repositorio,
  cuenta = {},
  codigo,
  { ip = null, permitirVinculoInicial = false } = {}
) {
  const clave = await validar(repositorio, codigo);
  if (!clave.expiraEn || clave.usosMaximos === null || clave.usosMaximos === undefined) {
    throw AppError.conflicto(
      'La clave está incompleta: la administración debe definir su cupo y su vencimiento'
    );
  }
  const claveActual = cuenta.claveId ? String(cuenta.claveId) : '';

  if (clave.modo === 'unica' && claveActual !== String(clave.id)) {
    throw AppError.noAutenticado('La clave no corresponde a esta cuenta');
  }

  if (claveActual && claveActual !== String(clave.id)) {
    const esRenovacion = String(clave.renovadaDeId || '') === claveActual;
    if (!esRenovacion) {
      throw new AppError(403, 'La clave no corresponde a tu cuenta', [
        { codigo: 'clave_no_corresponde' }
      ]);
    }
  }

  if (!claveActual) {
    if (!permitirVinculoInicial) {
      throw new AppError(403, 'Tu cuenta aún no tiene una clave vinculada', [
        { codigo: 'clave_no_asignada' }
      ]);
    }
    if (clave.modo === 'unica') {
      throw AppError.noAutenticado('La clave no corresponde a esta cuenta');
    }
    const disponible = await cupoDisponible(repositorio, clave);
    if (disponible !== null && disponible <= 0) {
      throw AppError.conflicto('La clave ya alcanzó su cupo de funcionarios');
    }
  }

  const asignaciones = await repositorio.alcanceDeUsuario(cuenta.id);
  await exigirCobertura(repositorio, clave, {
    municipios: asignaciones.municipios.length
      ? asignaciones.municipios
      : cuenta.municipioId
        ? [cuenta.municipioId]
        : [],
    estados: asignaciones.estados
  });

  const ahora = new Date();
  const vigenteHasta =
    clave.expiraEn || new Date(ahora.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

  if (claveActual && claveActual !== String(clave.id)) {
    await repositorio.desvincularCuentaDeClave(claveActual, cuenta.id);
  }
  await repositorio.vincularCuentaAClave(clave.id, cuenta.id, {
    activadaEn: ahora.toISOString()
  });
  await registrarUso(repositorio, clave, { usuarioId: cuenta.id, ip });
  await repositorio.actualizarClaveAcceso(clave.id, {
    activadaEn: ahora.toISOString(),
    activadaPorUsuarioId: cuenta.id
  });
  await repositorio.actualizarUsuario(cuenta.id, {
    claveId: clave.id,
    claveActivadaEn: ahora.toISOString(),
    claveVigenteHasta: vigenteHasta,
    claveObligatoria: true
  });

  return { ...clave, activadaEn: ahora.toISOString(), activadaPorUsuarioId: cuenta.id };
}

export { ROLES_CLAVE };
