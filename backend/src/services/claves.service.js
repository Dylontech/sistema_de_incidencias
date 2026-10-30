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

const ROLES_CLAVE = ['funcionario', 'auditor', 'enlace_estatal', 'enlace_federal', 'soporte'];

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
  // La clave es la autorización: si declara permisos, esa lista manda (puede
  // conceder una excepción como «crear usuarios» a un funcionario). Si no los
  // declara, se conservan los de la cuenta por compatibilidad.
  const permisos = Array.isArray(clave.permisos)
    ? normalizarListaPermisos(clave.permisos)
    : permisosCuenta;
  return {
    ...usuario,
    claveId: clave.id || usuario.claveId || null,
    municipios: territorio.municipios,
    estados: territorio.estados,
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
    return {
      ...clave,
      usuariosVinculados: usuarios[clave.id] || [],
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
  const permisosPedidos = normalizarListaPermisos(datos.permisos);
  // Si no se envían permisos, la clave hereda la matriz del rol sugerido. Si
  // tampoco hay rol, queda sin recorte (compatibilidad con claves antiguas).
  const permisos =
    permisosPedidos === undefined
      ? rolSugerido
        ? permisosBaseDeRol(rolSugerido)
        : null
      : permisosPedidos;
  const usosMaximos =
    datos.usosMaximos === null || datos.usosMaximos === undefined || datos.usosMaximos === ''
      ? null
      : Math.max(1, Number(datos.usosMaximos) || 1);
  const expiraEn = datos.expiraEn
    ? new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(String(datos.expiraEn))
          ? `${datos.expiraEn}T23:59:59`
          : datos.expiraEn
      )
    : null;
  if (expiraEn && Number.isNaN(expiraEn.getTime())) {
    throw AppError.solicitudInvalida('La fecha de expiración no es válida');
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
      activa: true,
      usosMaximos,
      usos: 0,
      expiraEn: expiraEn ? expiraEn.toISOString() : null,
      creadoPor: actor?.username || null,
      creadoEn: new Date().toISOString(),
      revocadaEn: null,
      notificacionesActivas: true,
      permisos,
      municipios: todosMunicipios,
      estados
    };
    return repositorio.crearClaveAcceso(clave);
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

  return crear(repositorio, actor, {
    nombre: `Acceso de ${cuenta.nombre || cuenta.username}`,
    rolSugerido: ROLES_CLAVE.includes(cuenta.rol) ? cuenta.rol : null,
    // La clave documenta exactamente los permisos que tendrá la cuenta y los
    // vuelve a aplicar (recortados al territorio de la clave) al iniciar sesión.
    permisos: Array.isArray(cuenta.permisosEfectivos)
      ? cuenta.permisosEfectivos
      : permisosBaseDeRol(cuenta.rol),
    municipios,
    estados,
    usosMaximos: usosMaximos ?? null,
    expiraEn: expiraEn ?? null
  });
}

/**
 * Busca una clave vigente por id y comprueba que esté dentro del ámbito del
 * actor. La usa el alta de cuentas «desde una clave».
 */
export async function validarParaCuenta(repositorio, actor, id) {
  const clave = await repositorio.claveAccesoPorId(String(id || ''));
  if (!clave) throw AppError.noEncontrado('Clave de acceso no encontrada');
  if (!claveVigente(clave) || agotada(clave)) {
    throw AppError.conflicto('La clave de acceso no está vigente');
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
      usosMaximos: null
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

  const sesionesCerradas = await repositorio.cerrarSesionesPorClave(id, 'clave eliminada');
  const eliminada = await repositorio.eliminarClaveAcceso(id);
  if (!eliminada) throw AppError.noEncontrado('Clave no encontrada');
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
  if (!clave || clave.activa === false || codigoExpirado(clave) || agotada(clave)) {
    throw AppError.noAutenticado('Clave de acceso inválida o expirada');
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

export { ROLES_CLAVE };
