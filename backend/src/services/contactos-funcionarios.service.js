/**
 * SERVICIO: contacto directo a funcionarios.
 *
 * El ciudadano autenticado elige estado, municipio y uno o varios funcionarios.
 * No se piden nombre, correo ni teléfono: la cuenta es la identidad. Si el
 * municipio no tiene personal, se crea una solicitud de mediación para el admin.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { alcanceDe, esAdmin, esAlgunaAdmin, esEmpleado } from './alcance.service.js';
import { adjuntosDe, vincularAdjuntos } from './adjuntos.service.js';
import { emitir } from './notificaciones.service.js';

const ROLES_ATIENDEN = ['funcionario', 'admin_municipal', 'admin_estatal', 'admin'];

function exigirCuenta(usuario) {
  if (!usuario || usuario.rol === 'anonimo') {
    throw AppError.prohibido('Crea una cuenta para contactar a un funcionario');
  }
}

function texto(valor, campo, { requerido = false, max = 160 } = {}) {
  const limpio = String(valor ?? '').trim();
  if (requerido && !limpio) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo, mensaje: 'Este campo es obligatorio' }
    ]);
  }
  if (limpio.length > max) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo, mensaje: `No puede exceder ${max} caracteres` }
    ]);
  }
  return limpio;
}

function folio(prefijo) {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const azar = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefijo}-${fecha}-${azar}`;
}

function municipiosDelAlcance(usuario, municipios) {
  const alcance = alcanceDe(usuario);
  if (alcance.todos) return municipios;
  if (alcance.municipios) return municipios.filter((id) => alcance.municipios.has(id));
  return [];
}

/** Funcionarios activos de un municipio. */
export async function funcionariosDisponibles(repositorio, usuario, municipioId) {
  exigirCuenta(usuario);
  const id = texto(municipioId, 'municipioId', { requerido: true, max: 64 });
  const municipio = await repositorio.municipioPorId(id);
  if (!municipio) throw AppError.solicitudInvalida('Municipio no encontrado');

  const cuentas = await repositorio.usuariosPorRoles(ROLES_ATIENDEN);
  const alcances = await repositorio.alcancesDeUsuarios(cuentas.map((c) => c.id));
  return cuentas
    .filter((cuenta) => cuenta.activo !== false)
    .filter((cuenta) => {
      const alcance = alcances[cuenta.id] || { municipios: [], estados: [] };
      return (
        alcance.todos === true ||
        cuenta.municipioId === id ||
        (alcance.municipios || []).includes(id) ||
        (alcance.estados || []).includes(municipio.estado)
      );
    })
    .map((cuenta) => ({
      id: cuenta.id,
      username: cuenta.username,
      nombre: cuenta.nombre,
      rol: cuenta.rol,
      correo: cuenta.correo || null
    }));
}

/** Crea un contacto y lo reparte entre los funcionarios elegidos. */
export async function crearContacto(repositorio, usuario, datos = {}) {
  exigirCuenta(usuario);
  const municipioId = texto(datos.municipioId, 'municipioId', { requerido: true, max: 64 });
  const municipio = await repositorio.municipioPorId(municipioId);
  if (!municipio) throw AppError.solicitudInvalida('Municipio no encontrado');

  const disponibles = await funcionariosDisponibles(repositorio, usuario, municipioId);
  const ids = [...new Set((datos.funcionarioIds || []).filter(Boolean).map(String))];
  if (!ids.length) {
    throw AppError.solicitudInvalida('Selecciona al menos un funcionario');
  }
  const elegidos = disponibles.filter((f) => ids.includes(f.id));
  if (elegidos.length !== ids.length) {
    throw AppError.solicitudInvalida('Algún funcionario no pertenece al municipio seleccionado');
  }

  const adjuntos = Array.isArray(datos.adjuntos) ? [...new Set(datos.adjuntos.map(String))].slice(0, 3) : [];
  const contacto = {
    id: nuevoId(),
    folio: folio('CTF'),
    deUsuarioId: usuario.id || null,
    deUserKey: usuario.userKey || null,
    deNombre: usuario.nombre || usuario.username,
    estadoEntidad: municipio.estado,
    municipioId,
    asunto: texto(datos.asunto, 'asunto', { requerido: true, max: 160 }),
    mensaje: texto(datos.mensaje, 'mensaje', { requerido: adjuntos.length === 0, max: 4000 }),
    estado: 'nuevo',
    creadoEn: new Date().toISOString(),
    simulado: false,
    simulacionId: null
  };
  const destinatarios = elegidos.map((f) => ({
    contactoId: contacto.id,
    usuarioId: f.id,
    leidoEn: null,
    respondidoEn: null
  }));
  await repositorio.crearContactoFuncionario(contacto, destinatarios);
  if (adjuntos.length) {
    await vincularAdjuntos(repositorio, usuario, adjuntos, {
      contextoTipo: 'contacto',
      contextoId: contacto.id,
      proposito: 'chat'
    });
  }

  await emitir(repositorio, {
    evento: 'contacto_funcionario_creado',
    titulo: '✉️ Nuevo contacto directo',
    mensaje: `${contacto.folio} · ${contacto.asunto}`,
    severidad: 'info',
    entidadTipo: 'contacto_funcionario',
    entidadId: contacto.id,
    municipioId,
    url: `/?contacto=${encodeURIComponent(contacto.id)}`,
    paraUsuarios: elegidos.map((f) => f.username),
    claveDedupe: `contacto_funcionario:${contacto.id}`
  });

  return {
    folio: contacto.folio,
    id: contacto.id,
    destinatarios: elegidos.map((f) => ({ id: f.id, nombre: f.nombre })),
    mensaje: 'Tu mensaje se envió a los funcionarios seleccionados.'
  };
}

/** Contactos iniciados por el ciudadano autenticado. */
export async function listarMios(repositorio, usuario) {
  exigirCuenta(usuario);
  return repositorio.contactosFuncionarios({ autorId: usuario.id, limite: 200 });
}

/** Bandeja del personal: contactos en los que participa o de su ámbito. */
export async function listarBandeja(repositorio, usuario, filtros = {}) {
  if (!esEmpleado(usuario)) throw AppError.prohibido('Solo el personal puede ver la bandeja');
  const alcance = alcanceDe(usuario);
  let municipios = null;
  if (!alcance.todos) {
    if (alcance.municipios) municipios = [...alcance.municipios];
    else if (alcance.estados) {
      const catalogo = await repositorio.todosMunicipios();
      municipios = catalogo.filter((m) => alcance.estados.has(m.estado)).map((m) => m.id);
    } else municipios = [];
  }
  const lista = await repositorio.contactosFuncionarios({
    municipios,
    usuarioId: esAlgunaAdmin(usuario) ? null : usuario.id,
    estado: filtros.estado || null,
    texto: filtros.texto || '',
    limite: filtros.limite || 200
  });
  return Promise.all(
    lista.map(async (contacto) => ({
      ...contacto,
      destinatarios: await repositorio.contactoFuncionarioDestinatarios(contacto.id)
    }))
  );
}

async function participa(repositorio, usuario, contacto) {
  if (esAlgunaAdmin(usuario)) {
    const alcance = alcanceDe(usuario);
    if (alcance.todos) return true;
    if (alcance.municipios?.has(contacto.municipioId)) return true;
    if (alcance.estados?.has(contacto.estadoEntidad)) return true;
  }
  if (contacto.deUsuarioId === usuario.id || contacto.deUserKey === usuario.userKey) return true;
  const destinatarios = await repositorio.contactoFuncionarioDestinatarios(contacto.id);
  return destinatarios.some((d) => d.usuarioId === usuario.id);
}

/** Detalle con hilo y marcado de lectura. */
export async function detalle(repositorio, usuario, id) {
  const contacto = await repositorio.contactoFuncionarioPorId(id);
  if (!contacto) throw AppError.noEncontrado('Contacto no encontrado');
  if (!(await participa(repositorio, usuario, contacto))) {
    throw AppError.prohibido('No participas en este contacto');
  }
  if (esEmpleado(usuario)) {
    await repositorio.marcarContactoFuncionarioLeido(id, usuario.id);
  }
  const mensajes = contacto.mensajes || [];
  const mapaMensajes = await adjuntosDe(repositorio, 'contacto_mensaje', mensajes.map((m) => m.id));
  const mapaInicial = await adjuntosDe(repositorio, 'contacto', [contacto.id]);
  return {
    ...contacto,
    adjuntos: mapaInicial.get(contacto.id) || [],
    mensajes: mensajes.map((mensaje) => ({
      ...mensaje,
      adjuntos: mapaMensajes.get(mensaje.id) || []
    }))
  };
}

/** Responde dentro del hilo. */
export async function responder(repositorio, usuario, id, datos = {}) {
  const contacto = await repositorio.contactoFuncionarioPorId(id);
  if (!contacto) throw AppError.noEncontrado('Contacto no encontrado');
  if (!(await participa(repositorio, usuario, contacto))) {
    throw AppError.prohibido('No participas en este contacto');
  }
  if (contacto.estado === 'cerrado') throw AppError.conflicto('El contacto está cerrado');
  const adjuntos = Array.isArray(datos.adjuntos) ? [...new Set(datos.adjuntos.map(String))].slice(0, 3) : [];
  const cuerpo = texto(datos.cuerpo, 'cuerpo', { requerido: adjuntos.length === 0, max: 4000 });
  const mensaje = {
    id: nuevoId(),
    contactoId: id,
    deUsuarioId: usuario.id || null,
    deNombre: usuario.nombre || usuario.username,
    cuerpo,
    interno: false,
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearMensajeContactoFuncionario(mensaje);
  if (adjuntos.length) {
    await vincularAdjuntos(repositorio, usuario, adjuntos, {
      contextoTipo: 'contacto_mensaje',
      contextoId: mensaje.id,
      proposito: 'chat'
    });
  }
  await repositorio.actualizarContactoFuncionario(id, {
    estado: esEmpleado(usuario) ? 'respondido' : 'nuevo'
  });
  await emitir(repositorio, {
    evento: 'contacto_funcionario_respondido',
    titulo: '💬 Respuesta en contacto directo',
    mensaje: `${contacto.folio} · ${cuerpo.slice(0, 120)}`,
    severidad: 'info',
    entidadTipo: 'contacto_funcionario',
    entidadId: id,
    municipioId: contacto.municipioId,
    url: `/?contacto=${encodeURIComponent(id)}`,
    ...(esEmpleado(usuario) && contacto.deUserKey
      ? { paraUsuarios: [contacto.deUserKey] }
      : {}),
    claveDedupe: `contacto_funcionario_respuesta:${mensaje.id}`
  });
  return detalle(repositorio, usuario, id);
}

/** Solicitud de mediación cuando el municipio no tiene funcionarios. */
export async function solicitarAdmin(repositorio, usuario, datos = {}) {
  exigirCuenta(usuario);
  const municipioId = texto(datos.municipioId, 'municipioId', { requerido: true, max: 64 });
  const municipio = await repositorio.municipioPorId(municipioId);
  if (!municipio) throw AppError.solicitudInvalida('Municipio no encontrado');
  const disponibles = await funcionariosDisponibles(repositorio, usuario, municipioId);
  if (disponibles.length) {
    throw AppError.conflicto('Ese municipio ya tiene funcionarios disponibles');
  }
  const solicitud = {
    id: nuevoId(),
    folio: folio('SFL'),
    municipioId,
    estadoEntidad: municipio.estado,
    solicitadoPorUsuarioId: usuario.id || null,
    solicitadoPorUserKey: usuario.userKey || null,
    mensaje: texto(datos.mensaje, 'mensaje', { max: 1000 }),
    estado: 'pendiente',
    atendidoPor: null,
    atendidoEn: null,
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearSolicitudFuncionario(solicitud);
  await emitir(repositorio, {
    evento: 'municipio_sin_funcionario',
    titulo: '🏛️ Municipio sin funcionarios',
    mensaje: `${municipio.nombre}, ${municipio.estado}: ${solicitud.folio}`,
    severidad: 'alerta',
    entidadTipo: 'solicitud_funcionario',
    entidadId: solicitud.id,
    municipioId,
    url: '/?admin=mediaciones',
    claveDedupe: `municipio_sin_funcionario:${solicitud.id}`
  });
  return { ...solicitud, mensajeUsuario: 'Avisamos al administrador para que busque mediación.' };
}

export async function listarSolicitudes(repositorio, usuario) {
  if (!esAdmin(usuario)) throw AppError.prohibido('Solo el admin maestro puede ver las mediaciones');
  return repositorio.solicitudesFuncionario({ limite: 500 });
}

export async function atenderSolicitud(repositorio, usuario, id, datos = {}) {
  if (!esAdmin(usuario)) throw AppError.prohibido('Solo el admin maestro puede atender mediaciones');
  const actual = await repositorio.actualizarSolicitudFuncionario(id, {
    estado: datos.estado === 'rechazada' ? 'rechazada' : 'atendida',
    atendidoPor: usuario.username,
    atendidoEn: new Date().toISOString()
  });
  if (!actual) throw AppError.noEncontrado('Solicitud no encontrada');
  if (actual.solicitadoPorUserKey) {
    await emitir(repositorio, {
      evento: 'solicitud_funcionario_atendida',
      titulo: '✅ Solicitud de funcionario atendida',
      mensaje: `La solicitud ${actual.folio} fue revisada por el administrador.`,
      severidad: 'info',
      entidadTipo: 'solicitud_funcionario',
      entidadId: id,
      municipioId: actual.municipioId,
      url: '/?contacto=1',
      paraUsuarios: [actual.solicitadoPorUserKey],
      claveDedupe: `solicitud_funcionario_atendida:${id}`
    });
  }
  return actual;
}
