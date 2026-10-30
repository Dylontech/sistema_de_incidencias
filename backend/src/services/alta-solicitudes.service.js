/**
 * SERVICIO: solicitudes de alta de cuentas del personal.
 *
 * Un funcionario con `crear_usuarios` no crea cuentas directamente: rellena
 * los datos de la persona (nombre, usuario, correo y teléfono) y la
 * administración decide. Al aprobarla se crea la cuenta como funcionario en
 * los municipios del solicitante y la contraseña temporal se entrega a quien
 * la pidió por la campana de avisos.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { passwordTemporal } from '../utils/cifrado.js';
import { ROLES_ADMIN, ROLES_PERSONAL } from '../config/constantes.js';
import { alcanceDe, esAdminMaestro, esAlgunaAdmin } from './alcance.service.js';
import { tienePermiso } from './permisos.service.js';
import { normalizarCorreo } from '../models/usuario.model.js';
import { crear as crearUsuario } from './usuarios.service.js';
import { emitir } from './notificaciones.service.js';

const limpiar = (valor, max) => String(valor ?? '').trim().slice(0, max);

/** Municipios del actor que se asignarán a la cuenta nueva. */
function municipiosDelActor(actor) {
  const alcance = alcanceDe(actor);
  return alcance.municipios ? [...alcance.municipios] : [];
}

/** ¿La cuenta que aprueba la solicitud puede tocar esos municipios? */
async function dentroDelAlcance(repositorio, actor, municipios = []) {
  if (esAdminMaestro(actor)) return true;
  const propio = alcanceDe(actor);
  if (propio.todos) return true;
  if (!municipios.length) return false;
  if (propio.municipios) {
    return municipios.every((id) => propio.municipios.has(String(id)));
  }
  if (propio.estados) {
    const catalogo = await repositorio.municipiosLigeros();
    const porId = new Map(catalogo.map((m) => [String(m.id), m.estado]));
    return municipios.every((id) => propio.estados.has(porId.get(String(id))));
  }
  return false;
}

export async function crear(repositorio, actor, datos = {}) {
  if (!actor || !ROLES_PERSONAL.includes(actor.rol)) {
    throw AppError.prohibido('Solo el personal puede solicitar el alta de una cuenta');
  }
  if (!tienePermiso(actor, 'crear_usuarios') && !tienePermiso(actor, 'gestionar_usuarios')) {
    throw AppError.prohibido('No tienes permiso para solicitar altas de cuentas');
  }
  const municipios = municipiosDelActor(actor);
  if (!municipios.length) {
    throw AppError.prohibido(
      'Necesitas tener municipios asignados para solicitar el alta de un funcionario'
    );
  }

  const nombre = limpiar(datos.nombre, 160);
  if (nombre.length < 3) {
    throw AppError.solicitudInvalida('Escribe el nombre completo de la persona');
  }
  const username = limpiar(datos.username, 60).toLowerCase();
  if (!/^[a-z0-9._-]{3,60}$/.test(username)) {
    throw AppError.solicitudInvalida(
      'El usuario de acceso debe tener entre 3 y 60 caracteres: letras, números, punto, guion o guion bajo'
    );
  }
  const correo = datos.correo ? normalizarCorreo(datos.correo) : null;
  if (datos.correo && !correo) {
    throw AppError.solicitudInvalida('Escribe un correo válido o déjalo vacío');
  }
  if (correo) {
    const ocupado = await repositorio.usuarioPorCorreo(correo);
    if (ocupado) {
      throw AppError.conflicto('Ese correo ya está registrado en otra cuenta');
    }
  }
  if (await repositorio.usuarioPorUsername(username)) {
    throw AppError.conflicto('Ese usuario de acceso ya está en uso');
  }

  const pendientes = await repositorio.solicitudesUsuario({ estado: 'pendiente', limite: 200 });
  if (pendientes.some((s) => String(s.username).toLowerCase() === username)) {
    throw AppError.conflicto('Ya hay una solicitud de alta pendiente para ese usuario');
  }

  const solicitud = {
    id: nuevoId(),
    username,
    nombre,
    correo,
    telefono: limpiar(datos.telefono, 40) || null,
    notas: limpiar(datos.notas, 600),
    municipios,
    estado: 'pendiente',
    solicitadoPorId: actor.id || null,
    solicitadoPor: actor.username || null,
    resueltoPor: null,
    resueltoEn: null,
    respuesta: '',
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearSolicitudUsuario(solicitud);
  await emitir(repositorio, {
    evento: 'alta_solicitada',
    titulo: 'Solicitud de alta de una cuenta',
    mensaje: `${solicitud.solicitadoPor} solicita crear la cuenta de ${nombre} (${username}).`,
    municipioId: municipios[0] || null,
    entidadTipo: 'alta',
    entidadId: solicitud.id,
    url: `/?panel=usuarios&alta=${encodeURIComponent(solicitud.id)}`,
    excluir: [solicitud.solicitadoPor]
  });
  return solicitud;
}

export async function mias(repositorio, actor) {
  const todas = await repositorio.solicitudesUsuario({ limite: 200 });
  return todas.filter((s) => String(s.solicitadoPorId) === String(actor.id));
}

export async function listar(repositorio, actor, filtros = {}) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo la administración revisa las solicitudes de alta');
  }
  const estado = ['pendiente', 'aprobada', 'rechazada'].includes(filtros.estado)
    ? filtros.estado
    : null;
  const solicitudes = await repositorio.solicitudesUsuario({
    estado,
    limite: filtros.limite || 200
  });
  if (esAdminMaestro(actor)) return solicitudes;

  const visibles = [];
  for (const solicitud of solicitudes) {
    if (await dentroDelAlcance(repositorio, actor, solicitud.municipios || [])) {
      visibles.push(solicitud);
    }
  }
  return visibles;
}

export async function resolver(repositorio, actor, id, { aprobar = true, respuesta = '' } = {}) {
  if (!esAlgunaAdmin(actor)) {
    throw AppError.prohibido('Solo la administración puede resolver solicitudes de alta');
  }
  const solicitud = await repositorio.solicitudUsuarioPorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  if (solicitud.estado !== 'pendiente') {
    throw AppError.conflicto('Esa solicitud ya fue resuelta');
  }
  if (!(await dentroDelAlcance(repositorio, actor, solicitud.municipios || []))) {
    throw AppError.prohibido('Esa solicitud está fuera de tu ámbito territorial');
  }

  let usuario = null;
  let password = null;
  if (aprobar) {
    password = passwordTemporal();
    // Se crea como funcionario con los municipios que el solicitante tenía
    // cuando la pidió. `usuarios.crear` valida de nuevo el alcance y los
    // duplicados de usuario y correo.
    usuario = await crearUsuario(
      repositorio,
      {
        username: solicitud.username,
        nombre: solicitud.nombre,
        correo: solicitud.correo,
        telefono: solicitud.telefono,
        rol: 'funcionario',
        municipios: solicitud.municipios,
        estados: [],
        password
      },
      { actor }
    );
  }

  const actualizada = await repositorio.actualizarSolicitudUsuario(id, {
    estado: aprobar ? 'aprobada' : 'rechazada',
    resueltoPor: actor.username,
    resueltoEn: new Date().toISOString(),
    respuesta: limpiar(respuesta, 600)
  });

  const destinatario = solicitud.solicitadoPor || null;
  await emitir(repositorio, {
    evento: 'alta_resuelta',
    titulo: aprobar ? 'Cuenta creada' : 'Solicitud de alta rechazada',
    mensaje: aprobar
      ? `La cuenta de ${solicitud.nombre} quedó creada con el usuario ${solicitud.username}. La contraseña temporal es: ${password}. Entrégasela y pide que la cambie.`
      : `La solicitud de alta de ${solicitud.nombre} fue rechazada. ${limpiar(respuesta, 600)}`.trim(),
    paraUsuarios: [destinatario].filter(Boolean),
    municipioId: (solicitud.municipios || [])[0] || null,
    entidadTipo: 'alta',
    entidadId: id,
    url: usuario ? `/?panel=usuarios&alta=${encodeURIComponent(id)}` : '/'
  });

  return { solicitud: actualizada, usuario, password, generada: Boolean(password) };
}
