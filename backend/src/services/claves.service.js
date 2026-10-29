/** Claves de acceso para conjuntos de municipios. */
import crypto from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { nuevoCodigoClave } from '../utils/claves.js';
import { config } from '../config/index.js';
import { alcanceDe, esAdminMaestro } from './alcance.service.js';

const ROLES_CLAVE = ['funcionario', 'auditor', 'enlace_estatal', 'enlace_federal'];

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

export async function listar(repositorio, actor = null) {
  const claves = await repositorio.todasLasClaves();
  if (!actor || esAdminMaestro(actor)) return claves;

  const alcance = alcanceDe(actor);
  if (alcance.todos) return claves;
  if (alcance.municipios) {
    return claves.filter((c) => (c.municipios || []).some((id) => alcance.municipios.has(id)));
  }
  if (alcance.estados) {
    const catalogo = await repositorio.todosMunicipios();
    const porId = new Map(catalogo.map((m) => [m.id, m.estado]));
    return claves.filter((c) =>
      (c.municipios || []).some((id) => alcance.estados.has(porId.get(id)))
    );
  }
  return [];
}

export async function crear(repositorio, actor, datos = {}) {
  const nombre = String(datos.nombre || '').trim();
  const municipios = [...new Set((datos.municipios || []).filter(Boolean).map(String))];
  if (!nombre) throw AppError.solicitudInvalida('Escribe un nombre para la clave');
  if (!municipios.length) throw AppError.solicitudInvalida('Elige al menos un municipio');

  const catalogo = await repositorio.todosMunicipios();
  const existentes = new Set(catalogo.map((m) => m.id));
  if (municipios.some((id) => !existentes.has(id))) {
    throw AppError.solicitudInvalida('Alguno de los municipios no existe');
  }

  // Un administrador territorial solo genera claves de su ámbito.
  if (actor && !esAdminMaestro(actor)) {
    const alcance = alcanceDe(actor);
    if (alcance.municipios) {
      if (municipios.some((id) => !alcance.municipios.has(id))) {
        throw AppError.prohibido('Alguno de los municipios está fuera de tu ámbito');
      }
    } else if (alcance.estados) {
      const porId = new Map(catalogo.map((m) => [m.id, m.estado]));
      if (municipios.some((id) => !alcance.estados.has(porId.get(id)))) {
        throw AppError.prohibido('Alguno de los municipios está fuera de tu ámbito');
      }
    } else {
      throw AppError.prohibido('No tienes ámbito para generar claves');
    }
  }

  const rolSugerido = ROLES_CLAVE.includes(datos.rolSugerido) ? datos.rolSugerido : null;
  const usosMaximos =
    datos.usosMaximos === null || datos.usosMaximos === undefined || datos.usosMaximos === ''
      ? null
      : Math.max(1, Number(datos.usosMaximos) || 1);
  const expiraEn = datos.expiraEn ? new Date(datos.expiraEn) : null;
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
      municipios
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
  if (!municipios.length) return null;

  return crear(repositorio, actor, {
    nombre: `Acceso de ${cuenta.nombre || cuenta.username}`,
    rolSugerido: ROLES_CLAVE.includes(cuenta.rol) ? cuenta.rol : null,
    municipios,
    usosMaximos: usosMaximos ?? null,
    expiraEn: expiraEn ?? null
  });
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

export async function revocar(repositorio, actor, id) {
  const todas = await repositorio.todasLasClaves();
  const clave = todas.find((c) => c.id === id);
  if (!clave) throw AppError.noEncontrado('Clave no encontrada');

  if (actor && !esAdminMaestro(actor)) {
    const alcance = alcanceDe(actor);
    const permitida = (() => {
      if (alcance.todos) return true;
      if (alcance.municipios) {
        return (clave.municipios || []).every((m) => alcance.municipios.has(m));
      }
      return false;
    })();
    if (!permitida) throw AppError.prohibido('Esa clave está fuera de tu ámbito');
  }

  const revocada = await repositorio.revocarClaveAcceso(id);
  if (!revocada) throw AppError.noEncontrado('Clave no encontrada');
  return revocada;
}

/** Valida una clave para una entrada y devuelve el conjunto de municipios. */
export async function validar(repositorio, codigo) {
  const clave = await repositorio.claveAccesoPorCodigo(codigo);
  if (!clave || clave.activa === false || codigoExpirado(clave) || agotada(clave)) {
    throw AppError.noAutenticado('Clave de acceso inválida o expirada');
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
