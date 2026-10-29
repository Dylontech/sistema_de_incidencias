/** Claves de acceso para conjuntos de municipios. */
import crypto from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { nuevoCodigoClave } from '../utils/claves.js';
import { config } from '../config/index.js';
import { ESTADOS_REPUBLICA } from '../config/constantes.js';
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
  let visibles = claves;
  if (actor && !esAdminMaestro(actor)) {
    const alcance = alcanceDe(actor);
    if (alcance.todos) {
      visibles = claves;
    } else if (alcance.municipios) {
      visibles = claves.filter((c) => (c.municipios || []).some((id) => alcance.municipios.has(id)));
    } else if (alcance.estados) {
      const catalogo = await repositorio.todosMunicipios();
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
  const [usuarios, sesiones] = await Promise.all([
    repositorio.usuariosDeClaves(ids),
    repositorio.listarSesiones({ limite: 500 })
  ]);
  return visibles.map((clave) => {
    const propias = sesiones.filter((sesion) => sesion.claveId === clave.id);
    return {
      ...clave,
      usuariosVinculados: usuarios[clave.id] || [],
      sesionesActivas: propias.length,
      sesiones: propias
    };
  });
}

export async function crear(repositorio, actor, datos = {}) {
  const nombre = String(datos.nombre || '').trim();
  const municipios = [...new Set((datos.municipios || []).filter(Boolean).map(String))];
  const estados = [...new Set((datos.estados || []).filter(Boolean).map(String))];
  if (!nombre) throw AppError.solicitudInvalida('Escribe un nombre para la clave');
  if (!municipios.length && !estados.length) {
    throw AppError.solicitudInvalida('Elige al menos un municipio o un estado');
  }

  const catalogo = await repositorio.todosMunicipios();
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
    const catalogo = await repositorio.todosMunicipios();
    const porId = new Map(catalogo.map((m) => [String(m.id), m.estado]));
    if (!(clave.municipios || []).every((id) => alcance.estados.has(porId.get(String(id))))) {
      throw AppError.prohibido('Esa clave está fuera de tu ámbito');
    }
    return;
  }
  throw AppError.prohibido('Esa clave está fuera de tu ámbito');
}

export async function revocar(repositorio, actor, id) {
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
  const todas = await repositorio.todasLasClaves();
  const clave = todas.find((c) => c.id === id);
  if (!clave) throw AppError.noEncontrado('Clave no encontrada');
  await exigirAlcanceClave(repositorio, actor, clave);

  const sesionesCerradas = await repositorio.cerrarSesionesPorClave(id, 'clave eliminada');
  const eliminada = await repositorio.eliminarClaveAcceso(id);
  if (!eliminada) throw AppError.noEncontrado('Clave no encontrada');
  return { clave: eliminada, sesionesCerradas };
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
    const catalogo = await repositorio.todosMunicipios();
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
