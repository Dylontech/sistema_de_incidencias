/** Solicitudes de acceso para personal municipal, estatal o federal. */
import crypto from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { hashIp } from '../utils/privacidad.js';
import { normalizarCorreo } from '../models/usuario.model.js';
import { ESTADOS_REPUBLICA } from '../config/constantes.js';
import { alcanceDe } from './alcance.service.js';
import * as usuarios from './usuarios.service.js';
import * as claves from './claves.service.js';
import { enviarCorreo } from './correo.service.js';
import { emitir } from './notificaciones.service.js';
import { adjuntosDe, vincularAdjuntos } from './adjuntos.service.js';

const ROLES = ['funcionario', 'auditor', 'enlace_estatal', 'enlace_federal'];

/** El rol ya no lo impone el solicitante: se propone según el territorio. */
export function sugerirRolAcceso({ municipios = [], estados = [] } = {}) {
  if ((municipios || []).length) return 'funcionario';
  if ((estados || []).length === 1) return 'enlace_estatal';
  if ((estados || []).length > 1) return 'enlace_federal';
  return null;
}

function listaUnica(valor) {
  return [...new Set((valor || []).filter(Boolean).map((v) => String(v).trim()).filter(Boolean))];
}

/** Valida que municipios y estados existan y normaliza la selección. */
async function validarTerritorio(repositorio, { municipios = [], estados = [] } = {}) {
  const ids = listaUnica(municipios);
  const entidades = listaUnica(estados);
  if (!ids.length && !entidades.length) {
    throw AppError.solicitudInvalida('Indica al menos un municipio o estado');
  }

  const catalogo = await repositorio.todosMunicipios();
  const porId = new Map(catalogo.map((m) => [String(m.id), m]));
  const faltantes = ids.filter((id) => !porId.has(id));
  if (faltantes.length) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo: 'municipios', mensaje: `Municipio no encontrado: ${faltantes.join(', ')}` }
    ]);
  }

  const validos = new Set([...ESTADOS_REPUBLICA, ...catalogo.map((m) => m.estado)]);
  const estadosInvalidos = entidades.filter((estado) => !validos.has(estado));
  if (estadosInvalidos.length) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo: 'estados', mensaje: `Estado no encontrado: ${estadosInvalidos.join(', ')}` }
    ]);
  }

  return { municipios: ids, estados: entidades };
}

function enAlcance(solicitud, alcance, estadoDeMunicipio) {
  if (alcance.todos) return true;
  const municipiosSolicitud = solicitud.municipios || [];
  if (alcance.municipios && municipiosSolicitud.some((id) => alcance.municipios.has(String(id)))) {
    return true;
  }
  if (alcance.estados) {
    if ((solicitud.estados || []).some((estado) => alcance.estados.has(estado))) return true;
    return municipiosSolicitud.some((id) =>
      alcance.estados.has(estadoDeMunicipio.get(String(id)))
    );
  }
  return false;
}

function folio() {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ACC-${fecha}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function usuarioDesdeCorreo(correo) {
  return String(correo).split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40) || 'usuario';
}

function passwordTemporal() {
  return crypto.randomBytes(9).toString('base64url');
}

export async function crear(repositorio, datos = {}, { ip = null } = {}) {
  const nombre = String(datos.nombre || '').trim();
  const correo = normalizarCorreo(datos.correo);

  if (nombre.length < 4) throw AppError.solicitudInvalida('Escribe tu nombre completo');
  if (!correo) throw AppError.solicitudInvalida('Escribe un correo válido');

  const { municipios, estados } = await validarTerritorio(repositorio, {
    municipios: datos.municipios,
    estados: datos.estados
  });
  const rolSugerido = sugerirRolAcceso({ municipios, estados });
  if (!rolSugerido) {
    throw AppError.solicitudInvalida('Indica al menos un municipio o estado');
  }

  if (await repositorio.solicitudAccesoAbiertaPorCorreo(correo)) {
    throw AppError.conflicto('Ya tienes una solicitud pendiente con ese correo');
  }

  // Una cuenta ciudadana puede pedir acceso al panel: la solicitud se vincula
  // a su cuenta y la aprobación la promueve. Una cuenta de personal o de
  // administración ya tiene acceso y no debe crear otra.
  const cuenta = await repositorio.usuarioPorCorreo(correo);
  if (cuenta && cuenta.rol !== 'ciudadano') {
    throw AppError.conflicto(
      'Ese correo ya tiene acceso al sistema. Inicia sesión o recupera tu contraseña.'
    );
  }
  if (cuenta && cuenta.activo === false) {
    throw AppError.conflicto(
      'Ese correo tiene una cuenta inactiva. Pide a la administración que la reactive.'
    );
  }

  const solicitud = {
    id: nuevoId(),
    folio: folio(),
    nombre: nombre.slice(0, 160),
    correo,
    telefono: String(datos.telefono || '').slice(0, 40) || null,
    usuarioSugerido: cuenta?.username || usuarioDesdeCorreo(correo),
    rolSolicitado: rolSugerido,
    municipios,
    estados,
    justificacion: String(datos.justificacion || '').slice(0, 2000),
    estado: 'pendiente',
    revisadoPor: null,
    revisadoEn: null,
    motivoRechazo: null,
    usuarioId: cuenta?.id || null,
    ipHash: hashIp(ip),
    creadoEn: new Date().toISOString()
  };

  const documentos = [...new Set((datos.documentos || []).filter(Boolean).map(String))].slice(
    0,
    3
  );
  for (const id of documentos) {
    const adjunto = await repositorio.adjuntoPorId(id);
    if (!adjunto || adjunto.estado !== 'pendiente' || adjunto.proposito !== 'solicitud_acceso') {
      throw AppError.solicitudInvalida('Uno de los documentos ya no está disponible');
    }
  }

  await repositorio.crearSolicitudAcceso(solicitud);

  if (documentos.length) {
    await vincularAdjuntos(repositorio, null, documentos, {
      contextoTipo: 'solicitud_acceso',
      contextoId: solicitud.id,
      proposito: 'solicitud_acceso'
    });
  }

  await emitir(repositorio, {
    evento: 'solicitud_acceso_creada',
    titulo: '🪪 Nueva solicitud de acceso',
    mensaje: `${solicitud.folio} · ${solicitud.nombre} (${solicitud.rolSolicitado} sugerido)`,
    severidad: 'info',
    entidadTipo: 'solicitud_acceso',
    entidadId: solicitud.id,
    url: '/?admin=solicitudes',
    claveDedupe: `solicitud_acceso_creada:${solicitud.id}`
  });

  return {
    folio: solicitud.folio,
    estado: solicitud.estado,
    rolSugerido,
    vinculoCuenta: Boolean(cuenta)
  };
}

export async function listar(repositorio, { estado = null, actor = null } = {}) {
  let solicitudes = await repositorio.solicitudesAcceso({ estado });
  if (!solicitudes.length) return solicitudes;

  const catalogo = await repositorio.todosMunicipios();
  const porId = new Map(catalogo.map((m) => [String(m.id), m]));
  const estadoDeMunicipio = new Map(catalogo.map((m) => [String(m.id), m.estado]));

  // Un administrador territorial no debe ver solicitudes de fuera de su
  // ámbito. Sin actor (llamadas internas) se conserva el listado completo.
  if (actor) {
    const alcance = alcanceDe(actor);
    solicitudes = solicitudes.filter((solicitud) =>
      enAlcance(solicitud, alcance, estadoDeMunicipio)
    );
  }

  const mapa = await adjuntosDe(
    repositorio,
    'solicitud_acceso',
    solicitudes.map((solicitud) => solicitud.id)
  );
  const vinculadas = await Promise.all(
    solicitudes.map((solicitud) =>
      solicitud.usuarioId ? repositorio.usuarioPorId(solicitud.usuarioId) : null
    )
  );

  return solicitudes.map((solicitud, indice) => {
    const municipiosDetalle = (solicitud.municipios || []).map((id) => {
      const municipio = porId.get(String(id));
      return {
        id: String(id),
        nombre: municipio?.nombre || String(id),
        estado: municipio?.estado || null
      };
    });
    const estadosDerivados = [
      ...new Set(municipiosDetalle.map((m) => m.estado).filter(Boolean))
    ];
    const estadosNombres = [
      ...new Set([...(solicitud.estados || []), ...estadosDerivados])
    ];
    const vinculada = vinculadas[indice];

    return {
      ...solicitud,
      rolSugerido: solicitud.rolSolicitado || sugerirRolAcceso(solicitud),
      municipiosDetalle,
      municipiosNombres: municipiosDetalle.map((m) => m.nombre),
      estadosDerivados,
      estadosNombres,
      usuarioVinculado: vinculada
        ? {
            id: vinculada.id,
            username: vinculada.username,
            nombre: vinculada.nombre,
            rol: vinculada.rol
          }
        : null,
      documentos: mapa.get(solicitud.id) || []
    };
  });
}

export async function rechazar(repositorio, actor, id, motivo = '') {
  const solicitud = await repositorio.solicitudAccesoPorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  if (solicitud.estado !== 'pendiente') throw AppError.conflicto('La solicitud ya fue revisada');
  const actualizada = await repositorio.actualizarSolicitudAcceso(id, {
    estado: 'rechazada',
    revisadoPor: actor?.username || null,
    revisadoEn: new Date().toISOString(),
    motivoRechazo: String(motivo || '').slice(0, 300)
  });

  enviarCorreo(repositorio, {
    para: solicitud.correo,
    asunto: 'Tu solicitud de acceso no fue aprobada',
    tipo: 'solicitud',
    texto: [
      `Hola ${solicitud.nombre},`,
      'Tu solicitud de acceso al Sistema de Incidencias no fue aprobada.',
      motivo ? `Motivo: ${motivo}` : '',
      'Si crees que es un error, contacta al administrador del sistema.'
    ]
      .filter(Boolean)
      .join('\n')
  }).catch(() => {});

  return actualizada;
}

/**
 * Aprueba la solicitud: crea la cuenta —o promueve la cuenta ciudadana ya
 * vinculada—, le asocia una clave y envía las credenciales.
 */
export async function aprobar(repositorio, actor, id, datos = {}) {
  const solicitud = await repositorio.solicitudAccesoPorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  if (solicitud.estado !== 'pendiente') throw AppError.conflicto('La solicitud ya fue revisada');

  const rol = String(
    datos.rol || solicitud.rolSolicitado || sugerirRolAcceso(solicitud) || ''
  );
  if (!ROLES.includes(rol)) {
    throw AppError.solicitudInvalida('Elige un rol válido para la cuenta');
  }

  const generarClave = datos.generarClave === true;
  const claveId = String(datos.claveId || '');
  if (!generarClave && !claveId) {
    throw AppError.solicitudInvalida(
      'Elige una clave existente o genera una nueva para aprobar la solicitud'
    );
  }
  if (generarClave && !datos.claveExpiraEn) {
    throw AppError.solicitudInvalida(
      'Indica la fecha de vencimiento de la clave nueva antes de aprobar'
    );
  }

  const claveExistente = claveId
    ? await claves.validarParaCuenta(repositorio, actor, claveId, {
        municipios: solicitud.municipios,
        estados: solicitud.estados
      })
    : null;
  if (claveExistente?.rolSugerido && claveExistente.rolSugerido !== rol) {
    throw AppError.conflicto(
      `La clave elegida pertenece al rol ${claveExistente.rolSugerido}. Elige otra o genera una nueva para ${rol}.`
    );
  }

  let clave = claveExistente;
  let claveGenerada = false;
  if (!clave) {
    // Se crea antes de la cuenta para que, si la creación falla, no quede una
    // cuenta activa sin clave. Nace compartida con cupo 1 y se convierte en
    // única después de vincularla; así `usuarios.crear` puede validarla.
    clave = await claves.crear(repositorio, actor, {
      nombre: `Acceso de ${solicitud.nombre}`.slice(0, 160),
      rolSugerido: rol,
      municipios: solicitud.municipios,
      estados: solicitud.estados,
      modo: 'compartida',
      usosMaximos: 1,
      expiraEn: datos.claveExpiraEn
    });
    claveGenerada = true;
  }

  const base = solicitud.usuarioSugerido || usuarioDesdeCorreo(solicitud.correo);
  let creado = null;
  let password = null;
  let promovida = false;
  let ultimoError = null;

  try {
    const existente = solicitud.usuarioId
      ? await repositorio.usuarioPorId(solicitud.usuarioId)
      : await repositorio.usuarioPorCorreo(solicitud.correo);

    if (existente) {
      if (existente.rol !== 'ciudadano') {
        throw AppError.conflicto(
          'Ese correo ya tiene una cuenta de personal o administración. No se puede duplicar.'
        );
      }
      if (existente.activo === false) {
        throw AppError.conflicto(
          'La cuenta vinculada está inactiva. Reactívala antes de aprobar la solicitud.'
        );
      }
      creado = await usuarios.promoverCiudadano(repositorio, actor, existente.id, {
        rol,
        municipios: solicitud.municipios,
        estados: solicitud.estados,
        claveId: clave.id
      });
      promovida = true;
    } else {
      password = passwordTemporal();
      for (let intento = 0; intento < 5 && !creado; intento++) {
        const username = intento === 0 ? base : `${base}${intento + 1}`;
        try {
          creado = await usuarios.crear(
            repositorio,
            {
              username,
              nombre: solicitud.nombre,
              correo: solicitud.correo,
              rol,
              municipios: solicitud.municipios,
              estados: solicitud.estados,
              claveId: clave.id,
              password
            },
            { actor }
          );
        } catch (error) {
          ultimoError = error;
          // Otra petición pudo crear la cuenta ciudadana entre la consulta y
          // el alta: se promueve en lugar de devolver un duplicado.
          if (error?.estado === 409 && /correo/i.test(error.message || '')) {
            const porCorreo = await repositorio.usuarioPorCorreo(solicitud.correo);
            if (porCorreo?.rol === 'ciudadano' && porCorreo.activo !== false) {
              creado = await usuarios.promoverCiudadano(repositorio, actor, porCorreo.id, {
                rol,
                municipios: solicitud.municipios,
                estados: solicitud.estados,
                claveId: clave.id
              });
              promovida = true;
              password = null;
              break;
            }
          }
          if (error?.estado !== 409 || /correo/i.test(error.message || '')) break;
        }
      }
    }

    if (!creado) throw ultimoError || AppError.conflicto('No se pudo crear la cuenta');

    // La cuenta pudo crearse con la clave, pero se vuelve a asegurar el vínculo
    // para los casos de promoción o de reintento.
    await repositorio.vincularCuentaAClave(clave.id, creado.id);
    if (claveGenerada) {
      await repositorio
        .actualizarClaveAcceso(clave.id, { modo: 'unica' })
        .catch(() => null);
    }

    await repositorio.actualizarSolicitudAcceso(id, {
      estado: 'aprobada',
      revisadoPor: actor?.username || null,
      revisadoEn: new Date().toISOString(),
      claveId: clave.id,
      usuarioId: creado.id
    });
  } catch (error) {
    // Compensación: una cuenta recién creada no debe quedar activa sin clave,
    // y una clave generada para una aprobación fallida no debe ocupar cupo.
    if (creado && !promovida) {
      await repositorio
        .actualizarUsuario(creado.id, { activo: false, claveId: null, claveObligatoria: false })
        .catch(() => null);
    }
    if (claveGenerada) {
      await repositorio.eliminarClaveAcceso(clave.id).catch(() => null);
    }
    throw error;
  }

  enviarCorreo(repositorio, {
    para: solicitud.correo,
    asunto: 'Tu acceso al Sistema de Incidencias fue aprobado',
    tipo: 'solicitud',
    texto: [
      `Hola ${solicitud.nombre},`,
      promovida
        ? 'Tu cuenta ciudadana fue habilitada para el panel de gestión.'
        : `Tu cuenta fue aprobada con el usuario: ${creado.username}`,
      `Usuario o correo de acceso: ${creado.username} (${solicitud.correo})`,
      promovida
        ? 'Usa tu contraseña actual. Si la olvidaste, recupera el acceso desde /cuenta.'
        : `Contraseña temporal: ${password}`,
      `Clave de acceso: ${clave.codigo}`,
      promovida
        ? 'Al entrar por /personal se te pedirá la clave de activación.'
        : 'Guarda estos datos y cambia la contraseña al entrar.'
    ].join('\n')
  }).catch(() => {});

  await emitir(repositorio, {
    evento: 'solicitud_acceso_resuelta',
    titulo: '✅ Tu solicitud de acceso fue aprobada',
    mensaje: promovida
      ? `Tu cuenta ${creado.username} fue habilitada para el panel de gestión.`
      : `Tu cuenta ${creado.username} está lista. Cambia la contraseña temporal al entrar.`,
    severidad: 'exito',
    entidadTipo: 'solicitud_acceso',
    entidadId: id,
    paraUsuarios: [creado.username],
    claveDedupe: `solicitud_acceso_aprobada:${id}`
  });

  return {
    solicitud: await repositorio.solicitudAccesoPorId(id),
    usuario: {
      id: creado.id,
      username: creado.username,
      nombre: creado.nombre,
      promovida
    },
    password: password || null,
    promovida,
    clave: {
      id: clave.id,
      codigo: clave.codigo,
      expiraEn: clave.expiraEn,
      usosMaximos: clave.usosMaximos
    }
  };
}
