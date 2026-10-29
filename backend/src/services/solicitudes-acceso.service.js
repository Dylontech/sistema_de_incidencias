/** Solicitudes de acceso para personal municipal, estatal o federal. */
import crypto from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { hashIp } from '../utils/privacidad.js';
import { normalizarCorreo } from '../models/usuario.model.js';
import * as usuarios from './usuarios.service.js';
import * as claves from './claves.service.js';
import { enviarCorreo } from './correo.service.js';
import { emitir } from './notificaciones.service.js';

const ROLES = ['funcionario', 'auditor', 'enlace_estatal', 'enlace_federal'];

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
  const rolSolicitado = ROLES.includes(datos.rolSolicitado) ? datos.rolSolicitado : null;

  if (nombre.length < 4) throw AppError.solicitudInvalida('Escribe tu nombre completo');
  if (!correo) throw AppError.solicitudInvalida('Escribe un correo válido');
  if (!rolSolicitado) throw AppError.solicitudInvalida('Elige el tipo de acceso');

  if (await repositorio.solicitudAccesoAbiertaPorCorreo(correo)) {
    throw AppError.conflicto('Ya tienes una solicitud pendiente con ese correo');
  }

  const municipios = [...new Set((datos.municipios || []).filter(Boolean).map(String))];
  const estados = [...new Set((datos.estados || []).filter(Boolean).map(String))];
  if (!municipios.length && !estados.length) {
    throw AppError.solicitudInvalida('Indica al menos un municipio o estado');
  }

  const solicitud = {
    id: nuevoId(),
    folio: folio(),
    nombre: nombre.slice(0, 160),
    correo,
    telefono: String(datos.telefono || '').slice(0, 40) || null,
    usuarioSugerido: usuarioDesdeCorreo(correo),
    rolSolicitado,
    municipios,
    estados,
    justificacion: String(datos.justificacion || '').slice(0, 2000),
    estado: 'pendiente',
    revisadoPor: null,
    revisadoEn: null,
    motivoRechazo: null,
    ipHash: hashIp(ip),
    creadoEn: new Date().toISOString()
  };

  await repositorio.crearSolicitudAcceso(solicitud);

  await emitir(repositorio, {
    evento: 'solicitud_acceso_creada',
    titulo: '🪪 Nueva solicitud de acceso',
    mensaje: `${solicitud.folio} · ${solicitud.nombre} (${solicitud.rolSolicitado})`,
    severidad: 'info',
    entidadTipo: 'solicitud_acceso',
    entidadId: solicitud.id,
    url: '/?admin=solicitudes',
    claveDedupe: `solicitud_acceso_creada:${solicitud.id}`
  });

  return { folio: solicitud.folio, estado: solicitud.estado };
}

export async function listar(repositorio, { estado = null } = {}) {
  return repositorio.solicitudesAcceso({ estado });
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
 * Aprueba la solicitud: crea la cuenta, genera una clave para sus municipios y
 * envía las credenciales por correo (o las registra en modo simulado).
 */
export async function aprobar(repositorio, actor, id) {
  const solicitud = await repositorio.solicitudAccesoPorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  if (solicitud.estado !== 'pendiente') throw AppError.conflicto('La solicitud ya fue revisada');

  const password = passwordTemporal();
  const base = solicitud.usuarioSugerido || usuarioDesdeCorreo(solicitud.correo);
  let creado = null;
  let ultimoError = null;

  for (let intento = 0; intento < 5 && !creado; intento++) {
    const username = intento === 0 ? base : `${base}${intento + 1}`;
    try {
      creado = await usuarios.crear(repositorio, {
        username,
        nombre: solicitud.nombre,
        correo: solicitud.correo,
        rol: solicitud.rolSolicitado,
        municipios: solicitud.municipios,
        estados: solicitud.estados,
        password
      });
    } catch (error) {
      ultimoError = error;
      if (error?.estado !== 409) break;
    }
  }
  if (!creado) throw ultimoError || AppError.conflicto('No se pudo crear la cuenta');

  let clave = null;
  if (solicitud.municipios.length) {
    clave = await claves.crear(repositorio, actor, {
      nombre: `Acceso de ${solicitud.nombre}`,
      municipios: solicitud.municipios,
      rolSugerido: solicitud.rolSolicitado
    });
  }

  await repositorio.actualizarSolicitudAcceso(id, {
    estado: 'aprobada',
    revisadoPor: actor?.username || null,
    revisadoEn: new Date().toISOString()
  });

  enviarCorreo(repositorio, {
    para: solicitud.correo,
    asunto: 'Tu acceso al Sistema de Incidencias fue aprobado',
    tipo: 'solicitud',
    texto: [
      `Hola ${solicitud.nombre},`,
      `Tu cuenta fue aprobada con el usuario: ${creado.username}`,
      `Contraseña temporal: ${password}`,
      clave ? `Clave de acceso: ${clave.codigo}` : 'No se generó clave de municipio.',
      'Guarda estos datos y cambia la contraseña al entrar.'
    ].join('\n')
  }).catch(() => {});

  await emitir(repositorio, {
    evento: 'solicitud_acceso_resuelta',
    titulo: '✅ Tu solicitud de acceso fue aprobada',
    mensaje: `Tu cuenta ${creado.username} está lista. Cambia la contraseña temporal al entrar.`,
    severidad: 'exito',
    entidadTipo: 'solicitud_acceso',
    entidadId: id,
    paraUsuarios: [creado.username],
    claveDedupe: `solicitud_acceso_aprobada:${id}`
  });

  return {
    solicitud: await repositorio.solicitudAccesoPorId(id),
    usuario: { username: creado.username },
    clave: clave ? { codigo: clave.codigo } : null
  };
}
