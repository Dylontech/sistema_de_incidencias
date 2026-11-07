/**
 * SERVICIO: cuenta del usuario.
 *
 * Verificación de correo, recuperación de contraseña, congelación y eliminación
 * de la propia cuenta ciudadana, además del job de inactividad. Los tokens se
 * guardan solo como hash y nunca se registran en la bitácora.
 */
import crypto from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { config } from '../config/index.js';
import { LIMITES_TEXTO } from '../config/constantes.js';
import {
  normalizarCorreo,
  verificarPassword,
  hashearPassword,
  limpiarSancion,
  publico
} from '../models/usuario.model.js';
import { cifrarPassword } from '../utils/cifrado.js';
import { hashIp } from '../utils/privacidad.js';
import {
  enviarVerificacionCuenta,
  enviarVerificacionCambioCorreo,
  enviarRecuperacionPassword,
  enviarCuentaEliminada,
  enviarAvisoInactividad,
  enviarAvisoCorreoCambiado
} from './correo.service.js';
import { valor as valorConfig } from './configuracion.service.js';
import { emitir } from './notificaciones.service.js';

const TIPO_VERIFICACION = 'verificar_correo';
const TIPO_RECUPERACION = 'recuperar_password';
const DIAS_CONGELACION = [7, 30, 90];
const MIN_PASSWORD = 8;

function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(`${config.jwt.secret}:${String(token || '')}`)
    .digest('hex');
}

function minutos(n) {
  return Number(n) * 60 * 1000;
}

function horas(n) {
  return minutos(Number(n) * 60);
}

function correoValido(correo) {
  return Boolean(normalizarCorreo(correo));
}

/** Aviso in-app al titular de una cuenta. Nunca interrumpe la operación. */
async function avisarCuenta(repositorio, evento, cuenta, { titulo, mensaje, url = '/?perfil=1' } = {}) {
  if (!cuenta?.username) return;
  await emitir(repositorio, {
    evento,
    paraUsuarios: [cuenta.username],
    titulo,
    mensaje,
    entidadTipo: 'cuenta',
    entidadId: cuenta.id || null,
    url
  }).catch(() => {});
}

/** Alerta de seguridad para la administración, sin datos secretos. */
async function alertarSeguridad(repositorio, cuenta, mensaje) {
  await emitir(repositorio, {
    evento: 'seguridad_alerta',
    titulo: '🔐 Cambio sensible en una cuenta',
    mensaje,
    entidadTipo: 'cuenta',
    entidadId: cuenta?.id || null,
    url: '/?panel=usuarios'
  }).catch(() => {});
}

/** Crea un token de un solo uso e invalida los anteriores del mismo tipo. */
async function crearToken(repositorio, usuario, tipo, { ip = null, userAgent = '' } = {}) {
  await repositorio.invalidarTokensCuenta(usuario.id, tipo);
  const token = crypto.randomBytes(32).toString('base64url');
  const [horasVerificacion, minutosRecuperacion] = await Promise.all([
    valorConfig(repositorio, 'cuentas.token_verificacion_horas'),
    valorConfig(repositorio, 'cuentas.token_recuperacion_minutos')
  ]);
  const expiraEn =
    tipo === TIPO_VERIFICACION
      ? new Date(Date.now() + horas(horasVerificacion)).toISOString()
      : new Date(Date.now() + minutos(minutosRecuperacion)).toISOString();
  await repositorio.crearTokenCuenta({
    id: nuevoId(),
    usuarioId: usuario.id,
    tipo,
    tokenHash: hashToken(token),
    expiraEn,
    usadoEn: null,
    creadoEn: new Date().toISOString(),
    ipHash: hashIp(ip),
    userAgent: String(userAgent || '').slice(0, 200)
  });
  return { token, expiraEn };
}

/** Crea el token y envía el correo de confirmación de una cuenta nueva. */
export async function emitirVerificacionCuenta(
  repositorio,
  usuario,
  { ip = null, userAgent = '' } = {}
) {
  const { token } = await crearToken(repositorio, usuario, TIPO_VERIFICACION, {
    ip,
    userAgent
  });
  await enviarVerificacionCuenta(repositorio, {
    para: usuario.correo,
    nombre: usuario.nombre,
    username: usuario.username,
    rol: usuario.rol,
    token
  });
  return { token };
}

/** Crea el token y envía la confirmación al correo NUEVO tras un cambio. */
export async function emitirVerificacionCambioCorreo(
  repositorio,
  usuario,
  { ip = null, userAgent = '' } = {}
) {
  const { token } = await crearToken(repositorio, usuario, TIPO_VERIFICACION, {
    ip,
    userAgent
  });
  await enviarVerificacionCambioCorreo(repositorio, {
    para: usuario.correo,
    nombre: usuario.nombre,
    token
  });
  return { token };
}

/** Busca un token vigente y devuelve también la cuenta asociada. */
async function buscarToken(repositorio, token, tipo) {
  const registro = await repositorio.tokenCuentaPorHash(hashToken(token));
  if (
    !registro ||
    registro.tipo !== tipo ||
    registro.usadoEn ||
    new Date(registro.expiraEn).getTime() <= Date.now()
  ) {
    throw new AppError(400, 'El enlace no es válido o ya venció', {
      codigo: 'token_invalido'
    });
  }
  const usuario = await repositorio.usuarioPorId(registro.usuarioId);
  if (!usuario) {
    throw new AppError(400, 'El enlace no es válido o ya venció', {
      codigo: 'token_invalido'
    });
  }
  return { registro, usuario };
}

/** Datos públicos mínimos del token para que la página pinte el formulario. */
export async function validarToken(repositorio, token) {
  const registro = await repositorio.tokenCuentaPorHash(hashToken(token));
  if (
    !registro ||
    registro.usadoEn ||
    new Date(registro.expiraEn).getTime() <= Date.now()
  ) {
    throw new AppError(400, 'El enlace no es válido o ya venció', {
      codigo: 'token_invalido'
    });
  }
  const usuario = await repositorio.usuarioPorId(registro.usuarioId);
  if (!usuario) {
    throw new AppError(400, 'El enlace no es válido o ya venció', {
      codigo: 'token_invalido'
    });
  }
  return {
    tipo: registro.tipo,
    nombre: usuario.nombre,
    username: usuario.username,
    rol: usuario.rol,
    expiraEn: registro.expiraEn
  };
}

/**
 * Solicita un enlace de recuperación. La respuesta es siempre la misma para no
 * revelar si el correo pertenece a una cuenta.
 */
export async function solicitarRecuperacion(
  repositorio,
  { correo },
  { ip = null, userAgent = '' } = {}
) {
  const email = normalizarCorreo(correo);
  if (!email) throw AppError.solicitudInvalida('Escribe un correo válido');

  const usuario = await repositorio.usuarioPorCorreo(email);
  if (usuario && usuario.activo !== false && usuario.correo) {
    const { token } = await crearToken(repositorio, usuario, TIPO_RECUPERACION, {
      ip,
      userAgent
    });
    await enviarRecuperacionPassword(repositorio, {
      para: usuario.correo,
      nombre: usuario.nombre,
      username: usuario.username,
      rol: usuario.rol,
      token
    });
  }
  return { ok: true };
}

/** Reenvía la confirmación de correo a una cuenta que aún no la completó. */
export async function reenviarVerificacion(
  repositorio,
  { correo },
  { ip = null, userAgent = '' } = {}
) {
  const email = normalizarCorreo(correo);
  if (!email) throw AppError.solicitudInvalida('Escribe un correo válido');

  const usuario = await repositorio.usuarioPorCorreo(email);
  if (
    usuario &&
    usuario.activo !== false &&
    usuario.correo &&
    usuario.correoVerificado === false
  ) {
    const { token } = await crearToken(repositorio, usuario, TIPO_VERIFICACION, {
      ip,
      userAgent
    });
    await enviarVerificacionCuenta(repositorio, {
      para: usuario.correo,
      nombre: usuario.nombre,
      username: usuario.username,
      rol: usuario.rol,
      token
    });
  }
  return { ok: true };
}

/** Confirma el correo y reactiva una cuenta congelada por falta de verificación. */
export async function verificarCorreo(repositorio, token) {
  const { registro, usuario } = await buscarToken(repositorio, token, TIPO_VERIFICACION);
  const usada = await repositorio.marcarTokenCuentaUsado(registro.id);
  if (!usada) {
    throw new AppError(400, 'El enlace ya fue utilizado', { codigo: 'token_usado' });
  }

  const cambios = {
    correoVerificado: true,
    correoVerificadoEn: new Date().toISOString()
  };
  if (
    usuario.suspendido === true &&
    ['inactividad', 'sistema'].includes(usuario.suspendidoOrigen)
  ) {
    Object.assign(cambios, limpiarSancion());
  }
  const actualizado = await repositorio.actualizarUsuario(usuario.id, cambios);
  await avisarCuenta(repositorio, 'cuenta_verificada', actualizado || usuario, {
    titulo: '✅ Correo verificado',
    mensaje: 'Tu correo quedó confirmado. Ya puedes recibir avisos y recuperar tu cuenta.'
  });
  return {
    usuario: publico(actualizado),
    nombre: actualizado?.nombre || usuario.nombre,
    username: usuario.username,
    rol: usuario.rol
  };
}

/**
 * Restablece la contraseña con un token de recuperación. Cierra todas las
 * sesiones de la cuenta y deja el correo como verificado.
 */
export async function restablecerPassword(repositorio, { token, password }) {
  if (String(password || '').length < MIN_PASSWORD) {
    throw AppError.solicitudInvalida(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`, [
      { campo: 'password', mensaje: `Mínimo ${MIN_PASSWORD} caracteres` }
    ]);
  }
  const { registro, usuario } = await buscarToken(repositorio, token, TIPO_RECUPERACION);
  const usada = await repositorio.marcarTokenCuentaUsado(registro.id);
  if (!usada) {
    throw new AppError(400, 'El enlace ya fue utilizado', { codigo: 'token_usado' });
  }

  await repositorio.invalidarTokensCuenta(usuario.id, TIPO_RECUPERACION);
  const cambios = {
    passwordHash: await hashearPassword(password),
    passwordCifrada: cifrarPassword(password),
    correoVerificado: true,
    correoVerificadoEn: new Date().toISOString()
  };
  if (
    usuario.suspendido === true &&
    ['inactividad', 'sistema'].includes(usuario.suspendidoOrigen)
  ) {
    Object.assign(cambios, limpiarSancion());
  }
  const actualizado = await repositorio.actualizarUsuario(usuario.id, cambios);
  await repositorio.cerrarSesionesPorUsuario(usuario.id, 'contraseña restablecida');
  await avisarCuenta(repositorio, 'cuenta_password_cambiada', actualizado || usuario, {
    titulo: '🔐 Contraseña restablecida',
    mensaje: 'Tu contraseña se restableció correctamente y se cerraron las sesiones abiertas.'
  });
  await alertarSeguridad(
    repositorio,
    actualizado || usuario,
    `La cuenta ${usuario.username} restableció su contraseña con un enlace de recuperación.`
  );

  return {
    usuario: publico(actualizado),
    nombre: actualizado?.nombre || usuario.nombre,
    username: usuario.username,
    rol: usuario.rol,
    destino: usuario.rol === 'ciudadano' ? '/' : '/personal'
  };
}

/**
 * Cambia el correo de una cuenta ciudadana.
 *
 * Exige la contraseña, libera el correo anterior, deja la cuenta sin verificar
 * y envía la confirmación al correo nuevo. Cierra todas las sesiones: la
 * sesión abierta no debe seguir operando con un correo sin confirmar.
 */
export async function cambiarCorreo(
  repositorio,
  actor,
  { correo, password, ip = null, userAgent = '' } = {}
) {
  const cuenta = await repositorio.usuarioPorId(actor.id);
  if (!cuenta) throw AppError.noEncontrado('Cuenta no encontrada');
  if (cuenta.rol !== 'ciudadano') {
    throw AppError.prohibido('Solo las cuentas ciudadanas pueden cambiar su correo desde aquí');
  }
  if (!(await verificarPassword(cuenta, password))) {
    throw AppError.noAutenticado('La contraseña no es correcta');
  }

  const nuevo = normalizarCorreo(correo);
  if (!nuevo) {
    throw AppError.solicitudInvalida('Escribe un correo válido', [
      { campo: 'correo', mensaje: 'El correo no tiene un formato válido' }
    ]);
  }
  if (nuevo.length > LIMITES_TEXTO.correo) {
    throw AppError.solicitudInvalida('El correo es demasiado largo', [
      { campo: 'correo', mensaje: `No puede exceder ${LIMITES_TEXTO.correo} caracteres` }
    ]);
  }
  const anterior = cuenta.correo || null;
  if (nuevo === normalizarCorreo(anterior || '')) {
    throw AppError.solicitudInvalida('El correo nuevo debe ser diferente del actual', [
      { campo: 'correo', mensaje: 'Escribe un correo distinto' }
    ]);
  }
  const existente = await repositorio.usuarioPorCorreo(nuevo);
  if (existente && existente.id !== cuenta.id) {
    throw AppError.conflicto(
      'Ese correo ya está registrado en otra cuenta. Usa otro correo.'
    );
  }

  let actualizado;
  try {
    actualizado = await repositorio.actualizarUsuario(cuenta.id, {
      correo: nuevo,
      correoVerificado: false,
      correoVerificadoEn: null
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw AppError.conflicto(
        'Ese correo ya está registrado en otra cuenta. Usa otro correo.'
      );
    }
    throw error;
  }

  await emitirVerificacionCambioCorreo(repositorio, actualizado || { ...cuenta, correo: nuevo }, {
    ip,
    userAgent
  });
  // Un enlace de recuperación emitido al correo anterior ya no debe servir.
  await repositorio.invalidarTokensCuenta(cuenta.id, TIPO_RECUPERACION);
  if (anterior) {
    await enviarAvisoCorreoCambiado(repositorio, {
      para: anterior,
      nombre: cuenta.nombre,
      correoNuevo: nuevo
    }).catch(() => {});
  }
  const sesionesCerradas = await repositorio.cerrarSesionesPorUsuario(
    cuenta.id,
    'correo cambiado por el titular'
  );
  await avisarCuenta(repositorio, 'cuenta_correo_cambiado', actualizado || { ...cuenta, correo: nuevo }, {
    titulo: '📧 Correo de avisos actualizado',
    mensaje: `Tu correo cambió a ${nuevo}. Confirma el enlace que enviamos para volver a entrar.`
  });
  await alertarSeguridad(
    repositorio,
    cuenta,
    `La cuenta ${cuenta.username} cambió su correo de ${anterior || 'sin correo'} a ${nuevo}.`
  );
  return {
    correo: nuevo,
    correoAnterior: anterior,
    pendienteVerificacion: true,
    sesionesCerradas
  };
}

/** Cambia la contraseña de una cuenta ciudadana y cierra todas las sesiones. */
export async function cambiarPassword(
  repositorio,
  actor,
  { passwordActual, passwordNueva } = {}
) {
  const cuenta = await repositorio.usuarioPorId(actor.id);
  if (!cuenta) throw AppError.noEncontrado('Cuenta no encontrada');
  if (cuenta.rol !== 'ciudadano') {
    throw AppError.prohibido('Solo las cuentas ciudadanas pueden cambiar su contraseña desde aquí');
  }
  if (!(await verificarPassword(cuenta, passwordActual))) {
    throw AppError.noAutenticado('La contraseña actual no es correcta');
  }
  if (String(passwordNueva || '').length < MIN_PASSWORD) {
    throw AppError.solicitudInvalida(
      `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`,
      [{ campo: 'passwordNueva', mensaje: `Mínimo ${MIN_PASSWORD} caracteres` }]
    );
  }
  if (await verificarPassword(cuenta, passwordNueva)) {
    throw AppError.solicitudInvalida('La nueva contraseña debe ser diferente de la actual', [
      { campo: 'passwordNueva', mensaje: 'Escribe una contraseña distinta' }
    ]);
  }

  await repositorio.actualizarUsuario(cuenta.id, {
    passwordHash: await hashearPassword(passwordNueva),
    passwordCifrada: cifrarPassword(passwordNueva)
  });
  await repositorio.invalidarTokensCuenta(cuenta.id, TIPO_RECUPERACION);
  const sesionesCerradas = await repositorio.cerrarSesionesPorUsuario(
    cuenta.id,
    'contraseña cambiada por el titular'
  );
  await avisarCuenta(repositorio, 'cuenta_password_cambiada', cuenta, {
    titulo: '🔐 Contraseña actualizada',
    mensaje: 'Tu contraseña cambió correctamente. Por seguridad se cerraron todas las sesiones.'
  });
  await alertarSeguridad(
    repositorio,
    cuenta,
    `La cuenta ${cuenta.username} cambió su contraseña desde Mi cuenta.`
  );
  return { ok: true, reingresar: true, sesionesCerradas };
}

/** Congela la propia cuenta ciudadana durante 7, 30 o 90 días. */
export async function congelarCuenta(repositorio, actor, { dias, password } = {}) {
  const cuenta = await repositorio.usuarioPorId(actor.id);
  if (!cuenta) throw AppError.noEncontrado('Cuenta no encontrada');
  if (cuenta.rol !== 'ciudadano') {
    throw AppError.prohibido('Solo las cuentas ciudadanas pueden congelarse desde aquí');
  }
  const periodo = Number(dias);
  if (!DIAS_CONGELACION.includes(periodo)) {
    throw AppError.solicitudInvalida('Elige 7, 30 o 90 días de congelación');
  }
  if (!(await verificarPassword(cuenta, password))) {
    throw AppError.noAutenticado('La contraseña no es correcta');
  }

  const hasta = new Date(Date.now() + periodo * 24 * 60 * 60 * 1000).toISOString();
  await repositorio.actualizarUsuario(cuenta.id, {
    suspendido: true,
    suspendidoHasta: hasta,
    suspendidoMotivo: 'Congelada por el titular',
    suspendidoPor: cuenta.username,
    suspendidoOrigen: 'titular'
  });
  const sesionesCerradas = await repositorio.cerrarSesionesPorUsuario(
    cuenta.id,
    'cuenta congelada por el titular'
  );
  await avisarCuenta(repositorio, 'cuenta_congelada', cuenta, {
    titulo: '❄️ Cuenta congelada',
    mensaje: `Tu cuenta quedó congelada hasta el ${hasta.slice(0, 10)}. Puedes reactivarla iniciando sesión después de esa fecha.`
  });
  return { hasta, sesionesCerradas };
}

/**
 * Elimina definitivamente la cuenta ciudadana: baja lógica, anonimización de
 * la fila y limpieza de nombres denormalizados. El nombre y el correo quedan
 * libres para un registro nuevo.
 */
export async function eliminarCuenta(repositorio, actor, { password, confirmacion } = {}) {
  const cuenta = await repositorio.usuarioPorId(actor.id);
  if (!cuenta) throw AppError.noEncontrado('Cuenta no encontrada');
  if (cuenta.rol !== 'ciudadano') {
    throw AppError.prohibido('Solo las cuentas ciudadanas pueden eliminarse desde aquí');
  }
  if (!(await verificarPassword(cuenta, password))) {
    throw AppError.noAutenticado('La contraseña no es correcta');
  }
  if (String(confirmacion || '').trim() !== String(cuenta.nombre || '').trim()) {
    throw AppError.solicitudInvalida('Escribe exactamente tu nombre para confirmar la eliminación', [
      { campo: 'confirmacion', mensaje: 'El nombre no coincide' }
    ]);
  }

  const nombreNuevo = `Cuenta eliminada ${String(cuenta.id).slice(0, 8)}`;
  const correoAnterior = cuenta.correo || null;
  if (correoAnterior) {
    await enviarCuentaEliminada(repositorio, {
      para: correoAnterior,
      nombre: cuenta.nombre
    }).catch(() => {});
  }

  await emitir(repositorio, {
    evento: 'cuenta_eliminada',
    titulo: '🗑️ Cuenta ciudadana eliminada',
    mensaje: `La cuenta ${cuenta.username} se eliminó y anonimizó por decisión de su titular.`,
    entidadTipo: 'cuenta',
    entidadId: cuenta.id,
    url: '/?panel=usuarios'
  }).catch(() => {});
  await repositorio.cerrarSesionesPorUsuario(cuenta.id, 'cuenta eliminada por el titular');
  await repositorio.anonimizarHuellaDeUsuario({
    usuarioId: cuenta.id,
    usuarioKey: cuenta.username,
    username: cuenta.username,
    nombreAnterior: cuenta.nombre,
    nombreNuevo
  });
  await repositorio.eliminarPreferenciasUsuario(cuenta.id);
  await repositorio.eliminarBloqueosDeUsuario(cuenta.id);
  await repositorio.eliminarNotificacionesDeUsuario(cuenta.username);
  await repositorio.eliminarTokensCuenta(cuenta.id);
  await repositorio.guardarAlcanceUsuario(cuenta.id, { municipios: [], estados: [] });

  await repositorio.actualizarUsuario(cuenta.id, {
    nombre: nombreNuevo,
    correo: null,
    telefono: null,
    activo: false,
    pseudonimo: true,
    permisos: {},
    rolPersonalizadoId: null,
    rolPropioId: null,
    municipioId: null,
    claveId: null,
    claveActivadaEn: null,
    claveVigenteHasta: null,
    claveObligatoria: false,
    correoVerificado: false,
    correoVerificadoEn: null,
    passwordHash: await hashearPassword(crypto.randomBytes(32).toString('hex')),
    passwordCifrada: null,
    suspendido: false,
    suspendidoHasta: null,
    suspendidoMotivo: '',
    suspendidoPor: null,
    suspendidoOrigen: null
  });

  return { id: cuenta.id, nombre: nombreNuevo };
}

/**
 * Job periódico: congela cuentas ciudadanas verificadas sin actividad.
 * No toca al personal ni a cuentas con una sesión abierta.
 */
export async function congelarCuentasInactivas(repositorio) {
  const [activo, diasConfig] = await Promise.all([
    valorConfig(repositorio, 'cuentas.congelar_inactivas'),
    valorConfig(repositorio, 'cuentas.dias_inactividad')
  ]);
  if (!activo) return 0;
  const dias = Math.max(1, Number(diasConfig) || 30);
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  const usuarios = await repositorio.todosLosUsuarios();
  const candidatos = usuarios.filter(
    (u) =>
      u.rol === 'ciudadano' &&
      u.activo !== false &&
      u.correoVerificado !== false &&
      u.suspendido !== true &&
      u.correo &&
      u.creadoEn
  );
  if (!candidatos.length) return 0;

  const actividad = await repositorio.actividadDeUsuarios(
    candidatos.map((u) => u.id)
  );
  let congeladas = 0;
  for (const cuenta of candidatos) {
    const estado = actividad[cuenta.id] || {};
    if (estado.sesionAbierta) continue;
    const ultima = estado.ultima ? new Date(estado.ultima).getTime() : null;
    const referencia = ultima || new Date(cuenta.creadoEn).getTime();
    if (!Number.isFinite(referencia) || referencia > limite) continue;

    await repositorio.actualizarUsuario(cuenta.id, {
      suspendido: true,
      suspendidoHasta: null,
      suspendidoMotivo: `Sin actividad durante ${dias} días`,
      suspendidoPor: 'sistema',
      suspendidoOrigen: 'inactividad'
    });
    await repositorio.cerrarSesionesPorUsuario(cuenta.id, 'congelada por inactividad');
    await enviarAvisoInactividad(repositorio, {
      para: cuenta.correo,
      nombre: cuenta.nombre
    }).catch(() => {});
    congeladas++;
  }
  return congeladas;
}

/**
 * Reactiva una cuenta congelada por inactividad después de validar la
 * contraseña en el login. Devuelve `true` si se levantó la sanción.
 */
export async function reactivarPorInactividad(repositorio, cuenta) {
  if (
    !cuenta ||
    cuenta.suspendido !== true ||
    cuenta.suspendidoOrigen !== 'inactividad'
  ) {
    return false;
  }
  await repositorio.actualizarUsuario(cuenta.id, limpiarSancion());
  return true;
}
