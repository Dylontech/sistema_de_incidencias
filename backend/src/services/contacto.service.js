/**
 * SERVICIO: contacto ciudadano → funcionarios del municipio.
 *
 * El mensaje entra al buzón del personal del municipio y se avisa por correo a
 * quienes tengan correo registrado. La respuesta sale por correo y queda en el
 * expediente.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { normalizarCorreo } from '../models/usuario.model.js';
import { alcanceDe, esEmpleado, puedeOperar } from './alcance.service.js';
import { avisarAlPersonal, enviarRespuestaCiudadano } from './correo.service.js';
import { emitir } from './notificaciones.service.js';

function folioNuevo() {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `CON-${fecha}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function texto(valor, campo, { requerido = false, max = 300 } = {}) {
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

/** Crea el mensaje público y avisa al personal del municipio. */
export async function crear(repositorio, datos = {}, { ipHash = null } = {}) {
  const nombre = texto(datos.nombre, 'nombre', { requerido: true, max: 120 });
  const correo = normalizarCorreo(datos.correo);
  if (!correo) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo: 'correo', mensaje: 'Escribe un correo válido' }
    ]);
  }
  const municipioId = texto(datos.municipioId, 'municipioId', { requerido: true, max: 64 });
  const municipio = await repositorio.municipioPorId(municipioId);
  if (!municipio) throw AppError.solicitudInvalida('Municipio no encontrado');

  const mensaje = {
    id: nuevoId(),
    folio: folioNuevo(),
    municipioId,
    nombre,
    correo,
    telefono: texto(datos.telefono, 'telefono', { max: 40 }) || null,
    asunto: texto(datos.asunto, 'asunto', { requerido: true, max: 160 }),
    mensaje: texto(datos.mensaje, 'mensaje', { requerido: true, max: 2000 }),
    estado: 'nuevo',
    respuesta: '',
    respondidoPor: null,
    respondidoEn: null,
    ipHash,
    creadoEn: new Date().toISOString()
  };

  await repositorio.crearMensajeContacto(mensaje);

  // Aviso interno (campana) además del correo: el personal lo ve al entrar.
  await emitir(repositorio, {
    evento: 'contacto_creado',
    titulo: '✉️ Nuevo mensaje de contacto',
    mensaje: `${mensaje.folio} · ${mensaje.asunto}`,
    severidad: 'info',
    entidadTipo: 'contacto',
    entidadId: mensaje.id,
    municipioId,
    url: '/?bandeja=contacto',
    claveDedupe: `contacto_creado:${mensaje.id}`
  });

  // Aviso por correo a los funcionarios del municipio (si tienen correo).
  const usuarios = await repositorio.todosLosUsuarios();
  const destinatarios = usuarios.filter(
    (u) =>
      esEmpleado(u) &&
      u.activo !== false &&
      u.rol !== 'auditor' &&
      u.rol !== 'enlace_estatal' &&
      u.rol !== 'enlace_federal' &&
      u.correo &&
      (u.municipioId === municipioId || u.rol === 'admin')
  );
  for (const persona of destinatarios.slice(0, 20)) {
    await avisarAlPersonal(repositorio, {
      para: persona.correo,
      asunto: `Nuevo mensaje de contacto: ${mensaje.asunto}`,
      titulo: `Mensaje de ${mensaje.nombre}`,
      lineas: [
        `Municipio: ${municipio.nombre}, ${municipio.estado}`,
        `Correo: ${mensaje.correo}`,
        `Folio: ${mensaje.folio}`,
        mensaje.mensaje.slice(0, 400)
      ],
      tipo: 'contacto'
    });
  }

  return {
    folio: mensaje.folio,
    mensaje: 'Recibimos tu mensaje. El personal del municipio lo revisará y te responderá por correo.'
  };
}

/** Bandeja del personal, acotada a su ámbito. */
export async function listar(repositorio, usuario, filtros = {}) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Solo el personal puede ver los mensajes de contacto');
  }
  const alcance = alcanceDe(usuario);

  let municipios = null;
  if (!alcance.todos) {
    if (alcance.municipios) {
      municipios = [...alcance.municipios];
    } else if (alcance.estados) {
      const catalogo = await repositorio.todosMunicipios();
      municipios = catalogo.filter((m) => alcance.estados.has(m.estado)).map((m) => m.id);
    } else {
      municipios = [];
    }
  }

  return repositorio.mensajesContacto({
    municipios,
    estado: filtros.estado || null,
    limite: filtros.limite || 200
  });
}

/** Respuesta del personal: guarda el texto y lo envía al correo del ciudadano. */
export async function responder(repositorio, usuario, id, respuesta) {
  if (!puedeOperar(usuario)) {
    throw AppError.prohibido('Tu cuenta es de solo lectura');
  }
  const mensaje = await repositorio.mensajeContactoPorId(id);
  if (!mensaje) throw AppError.noEncontrado('Mensaje no encontrado');

  const alcance = alcanceDe(usuario);
  if (!alcance.todos) {
    if (alcance.municipios && !alcance.municipios.has(mensaje.municipioId)) {
      throw AppError.prohibido('El mensaje pertenece a otro municipio');
    }
  }

  const limpio = texto(respuesta, 'respuesta', { requerido: true, max: 2000 });
  const actualizado = await repositorio.actualizarMensajeContacto(id, {
    estado: 'respondido',
    respuesta: limpio,
    respondidoPor: usuario.username,
    respondidoEn: new Date().toISOString()
  });

  await enviarRespuestaCiudadano(repositorio, {
    para: mensaje.correo,
    asunto: `Respuesta a tu mensaje ${mensaje.folio}`,
    titulo: 'Respuesta del personal municipal',
    mensaje: limpio
  });

  return actualizado;
}
