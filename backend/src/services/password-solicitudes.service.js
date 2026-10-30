/**
 * SERVICIO: solicitudes de cambio de contraseña.
 *
 * El personal no cambia su propia contraseña: la pide desde «Mi cuenta» y la
 * administración de su ámbito la restablece. Al resolverla se genera una
 * contraseña temporal, se guarda cifrada para poder consultarla y se avisa al
 * solicitante.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { ROLES_ADMIN, ROLES_PERSONAL } from '../config/constantes.js';
import { alcanceDe, esAdminMaestro } from './alcance.service.js';
import { restablecerPassword } from './usuarios.service.js';
import { tienePermiso } from './permisos.service.js';
import { emitir } from './notificaciones.service.js';

/** ¿La cuenta solicitante cae dentro del territorio del actor? */
async function dentroDelAlcance(repositorio, actor, cuenta) {
  if (esAdminMaestro(actor)) return true;
  const propio = alcanceDe(actor);
  if (propio.todos) return true;
  const objetivo = await repositorio.alcanceDeUsuario(cuenta.id);
  const municipiosObjetivo = objetivo.municipios.length
    ? objetivo.municipios
    : cuenta.municipioId
      ? [cuenta.municipioId]
      : [];
  if (propio.municipios) {
    return (
      municipiosObjetivo.length > 0 &&
      municipiosObjetivo.every((id) => propio.municipios.has(String(id)))
    );
  }
  if (propio.estados) {
    if (
      objetivo.estados.length &&
      objetivo.estados.every((estado) => propio.estados.has(String(estado)))
    ) {
      return true;
    }
    if (!municipiosObjetivo.length) return false;
    const catalogo = await repositorio.municipiosLigeros();
    const porId = new Map(catalogo.map((m) => [String(m.id), m.estado]));
    return municipiosObjetivo.every((id) => propio.estados.has(porId.get(String(id))));
  }
  return false;
}

export async function crear(repositorio, usuario, datos = {}) {
  if (!usuario || usuario.rol === 'anonimo' || usuario.rol === 'ciudadano') {
    throw AppError.prohibido('Solo el personal puede solicitar el cambio de contraseña');
  }
  const motivo = String(datos.motivo || '').trim();
  if (motivo.length < 10) {
    throw AppError.solicitudInvalida('Explica en al menos 10 caracteres por qué necesitas el cambio');
  }

  // V2.11.2: el cambio puede pedirse para otra cuenta del propio ámbito. Sin
  // `usuarioId` la solicitud es del titular, como en «Mi cuenta».
  const objetivoId = datos.usuarioId ? String(datos.usuarioId) : String(usuario.id);
  const paraOtro = objetivoId !== String(usuario.id);
  let objetivo = usuario;

  if (paraOtro) {
    if (!tienePermiso(usuario, 'editar_usuarios') && !tienePermiso(usuario, 'gestionar_usuarios')) {
      throw AppError.prohibido(
        'No tienes permiso para solicitar el cambio de contraseña de otra cuenta'
      );
    }
    objetivo = await repositorio.usuarioPorId(objetivoId);
    if (!objetivo) throw AppError.noEncontrado('Usuario no encontrado');
    if (objetivo.id === usuario.id) {
      throw AppError.conflicto('Pide el cambio desde «Mi cuenta» para tu propia contraseña');
    }
    if (!ROLES_PERSONAL.includes(objetivo.rol)) {
      throw AppError.prohibido('Solo se pueden restablecer cuentas del personal');
    }
    if (ROLES_ADMIN.includes(objetivo.rol)) {
      throw AppError.prohibido(
        'La contraseña de una cuenta de administración solo la cambia la administración'
      );
    }
    if (objetivo.activo === false) {
      throw AppError.conflicto('Esa cuenta está inactiva');
    }
    if (!(await dentroDelAlcance(repositorio, usuario, objetivo))) {
      throw AppError.prohibido('Esa cuenta está fuera de tu ámbito territorial');
    }
  }

  const abiertas = await repositorio.solicitudesPassword({
    usuarioId: objetivo.id,
    estado: 'pendiente',
    limite: 5
  });
  if (abiertas.length) {
    throw AppError.conflicto(
      paraOtro
        ? 'Ya hay una solicitud de contraseña pendiente para esa cuenta'
        : 'Ya tienes una solicitud de contraseña pendiente'
    );
  }

  const solicitud = {
    id: nuevoId(),
    usuarioId: objetivo.id,
    username: objetivo.username,
    nombre: objetivo.nombre || objetivo.username,
    motivo: motivo.slice(0, 600),
    estado: 'pendiente',
    solicitadoPorId: usuario.id || null,
    solicitadoPor: usuario.username || null,
    resueltoPor: null,
    resueltoEn: null,
    respuesta: '',
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearSolicitudPassword(solicitud);
  await emitir(repositorio, {
    evento: 'solicitud_password_creada',
    titulo: paraOtro ? 'Solicitud de contraseña para una cuenta' : 'Solicitud de cambio de contraseña',
    mensaje: paraOtro
      ? `${solicitud.solicitadoPor} pide restablecer la contraseña de ${solicitud.nombre}: ${solicitud.motivo}`
      : `${solicitud.nombre} pide restablecer su contraseña: ${solicitud.motivo}`,
    municipioId: objetivo.municipioId || null,
    entidadTipo: 'password',
    entidadId: solicitud.id,
    url: `/?panel=usuarios&password=${encodeURIComponent(solicitud.id)}&usuario=${encodeURIComponent(objetivo.id)}`,
    excluir: [usuario.username]
  });
  return solicitud;
}

export async function misSolicitudes(repositorio, usuario) {
  // Incluye las propias y las que el actor pidió para otra cuenta de su ámbito.
  const todas = await repositorio.solicitudesPassword({ limite: 200 });
  return todas.filter(
    (s) =>
      String(s.usuarioId) === String(usuario.id) ||
      String(s.solicitadoPorId || '') === String(usuario.id)
  );
}

export async function listar(repositorio, actor, filtros = {}) {
  if (!tienePermiso(actor, 'revelar_password_usuarios')) {
    throw AppError.prohibido('No tienes permiso para revisar solicitudes de contraseña');
  }
  const estado = ['pendiente', 'resuelta', 'rechazada'].includes(filtros.estado)
    ? filtros.estado
    : null;
  const solicitudes = await repositorio.solicitudesPassword({
    estado,
    limite: filtros.limite || 200
  });
  if (esAdminMaestro(actor)) return solicitudes;

  const visibles = [];
  for (const solicitud of solicitudes) {
    const cuenta = await repositorio.usuarioPorId(solicitud.usuarioId);
    if (cuenta && (await dentroDelAlcance(repositorio, actor, cuenta))) {
      visibles.push(solicitud);
    }
  }
  return visibles;
}

export async function resolver(repositorio, actor, id, { aprobar = true, respuesta = '' } = {}) {
  if (!tienePermiso(actor, 'revelar_password_usuarios')) {
    throw AppError.prohibido('No tienes permiso para resolver solicitudes de contraseña');
  }
  const solicitud = await repositorio.solicitudPasswordPorId(id);
  if (!solicitud) throw AppError.noEncontrado('Solicitud no encontrada');
  if (solicitud.estado !== 'pendiente') {
    throw AppError.conflicto('Esa solicitud ya fue resuelta');
  }
  const cuenta = await repositorio.usuarioPorId(solicitud.usuarioId);
  if (!cuenta) throw AppError.noEncontrado('La cuenta solicitante ya no existe');
  if (!(await dentroDelAlcance(repositorio, actor, cuenta))) {
    throw AppError.prohibido('Esa cuenta está fuera de tu ámbito territorial');
  }

  const actualizada = await repositorio.actualizarSolicitudPassword(id, {
    estado: aprobar ? 'resuelta' : 'rechazada',
    resueltoPor: actor.username,
    resueltoEn: new Date().toISOString(),
    respuesta: String(respuesta || '').slice(0, 600)
  });

  let password = null;
  if (aprobar) {
    const resultado = await restablecerPassword(repositorio, actor, cuenta.id, {});
    password = resultado.password;
  }

  // V2.11.2: la contraseña nueva se entrega a quien pidió el cambio (el propio
  // titular o el funcionario que la solicitó para otra cuenta). Si son
  // distintos, el titular recibe un aviso sin la clave.
  const solicitante = solicitud.solicitadoPor || null;
  const pidioElTitular = !solicitante || solicitante === cuenta.username;
  const destinatario = solicitante || cuenta.username;
  const enlace = `/?panel=usuarios&password=${encodeURIComponent(id)}&usuario=${encodeURIComponent(cuenta.id)}`;

  if (aprobar && password) {
    await emitir(repositorio, {
      evento: 'solicitud_password_resuelta',
      titulo: pidioElTitular ? 'Tu contraseña fue restablecida' : 'Contraseña restablecida',
      mensaje: pidioElTitular
        ? `Tu nueva contraseña es: ${password}. Guárdala y cámbiala en cuanto puedas.`
        : `La nueva contraseña de ${cuenta.nombre || cuenta.username} es: ${password}. Entrégasela y pide que la cambie.`,
      paraUsuarios: [destinatario].filter(Boolean),
      municipioId: cuenta.municipioId || null,
      entidadTipo: 'password',
      entidadId: id,
      url: enlace
    });
    if (!pidioElTitular) {
      await emitir(repositorio, {
        evento: 'solicitud_password_resuelta',
        titulo: 'Tu contraseña fue restablecida',
        mensaje: `${actor.username} pidió restablecer tu contraseña. Pídesela para volver a entrar y cámbiala en cuanto puedas.`,
        paraUsuarios: [cuenta.username],
        municipioId: cuenta.municipioId || null,
        entidadTipo: 'password',
        entidadId: id,
        url: '/'
      });
    }
  } else {
    await emitir(repositorio, {
      evento: 'solicitud_password_resuelta',
      titulo: 'Solicitud de contraseña rechazada',
      mensaje: `La solicitud de cambio de contraseña fue rechazada. ${respuesta || ''}`.trim(),
      paraUsuarios: [destinatario].filter(Boolean),
      municipioId: cuenta.municipioId || null,
      entidadTipo: 'password',
      entidadId: id,
      url: '/'
    });
  }

  // La contraseña temporal también viaja en esta respuesta, una única vez,
  // para que el panel la muestre al administrador que resolvió.
  return { solicitud: actualizada, password, generada: Boolean(password) };
}
