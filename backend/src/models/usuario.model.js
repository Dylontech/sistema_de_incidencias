/**
 * MODELO: Usuario.
 * Las contraseñas se guardan siempre con bcrypt (el monolito las tenía en claro).
 */
import bcrypt from 'bcryptjs';
import { ROLES_PERSONAL, LIMITES_TEXTO } from '../config/constantes.js';
import { config } from '../config/index.js';
import { recolector } from '../utils/validacion.js';
import { nuevoId } from '../utils/ids.js';

const RONDAS = 10;

/** Contraseñas que no se admiten aunque cumplan la longitud. */
const PASSWORD_PROHIBIDAS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'contrasena',
  'contraseña',
  'password',
  'qwertyui',
  'iloveyou',
  '11111111',
  'admin123',
  'incidencias'
]);

/** Validación laxa de correo: no manda correos, solo evita erratas evidentes. */
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

/** Correo normalizado (minúsculas, sin espacios) o '' si no es válido. */
export function normalizarCorreo(valor) {
  const limpio = String(valor ?? '').trim().toLowerCase();
  return PATRON_CORREO.test(limpio) ? limpio : '';
}

export async function hashearPassword(password) {
  return bcrypt.hash(password, RONDAS);
}

export async function verificarPassword(usuario, password) {
  if (!usuario || !usuario.passwordHash || !password) return false;
  return bcrypt.compare(String(password), usuario.passwordHash);
}

/**
 * Representación segura para la API. Además del hash de contraseña se dejan
 * fuera los hashes de los tokens (verificación y restablecimiento), que solo
 * tienen sentido dentro del servidor.
 */
export function publico(usuario) {
  if (!usuario) return null;
  const {
    passwordHash,
    password,
    passwordInicial,
    tokenVerificacionHash,
    tokenVerificacionExpira,
    resetTokenHash,
    resetExpira,
    tokenVersion,
    intentosFallidos,
    bloqueadoHasta,
    ...resto
  } = usuario;
  return resto;
}

/**
 * Datos que viajan dentro del token y del objeto `req.usuario`.
 * `version` es la versión de la sesión: al cambiar la contraseña sube y todos
 * los tokens anteriores dejan de valer.
 */
export function paraSesion(usuario) {
  return {
    username: usuario.username,
    nombre: usuario.nombre,
    rol: usuario.rol,
    municipioId: usuario.municipioId || null,
    correo: usuario.correo || null,
    version: versionDeSesion(usuario)
  };
}

/** Versión de sesión de la cuenta (1 si nunca se cambió la contraseña). */
export function versionDeSesion(usuario) {
  const valor = Number(usuario?.tokenVersion || 0);
  return valor > 0 ? valor : 1;
}

/**
 * Problemas de una contraseña nueva (lista vacía = válida).
 *
 * Se pide lo mínimo que evita el desastre: longitud, que no sea la propia
 * dirección y que no esté en la lista de las de siempre. La longitud es lo que
 * de verdad protege, así que no se piden símbolos ni mayúsculas.
 */
export function problemasDePassword(password, { correo = '' } = {}) {
  const valor = String(password ?? '');
  const problemas = [];

  if (valor.length < LIMITES_TEXTO.passwordMin) {
    problemas.push(`Debe tener al menos ${LIMITES_TEXTO.passwordMin} caracteres`);
  }
  if (valor.length > LIMITES_TEXTO.passwordMax) {
    problemas.push(`No puede exceder ${LIMITES_TEXTO.passwordMax} caracteres`);
  }

  const simple = valor.trim().toLowerCase();
  if (simple && PASSWORD_PROHIBIDAS.has(simple)) {
    problemas.push('Es una contraseña demasiado común');
  }

  const cuenta = String(correo || '').trim().toLowerCase();
  if (cuenta && simple === cuenta) {
    problemas.push('No puede coincidir con tu correo');
  }
  const local = cuenta.split('@')[0];
  if (local && local.length >= 4 && simple === local) {
    problemas.push('No puede coincidir con la parte anterior a la arroba de tu correo');
  }

  return problemas;
}

/** Valida una contraseña nueva y la devuelve; lanza validación si no sirve. */
export function validarPassword(password, { correo = '' } = {}) {
  const v = recolector();
  for (const problema of problemasDePassword(password, { correo })) {
    v.agregar('password', problema);
  }
  v.terminar();
  return String(password ?? '');
}

/**
 * Bloqueo temporal por intentos fallidos.
 *
 * Se cuenta por cuenta y no por IP: así no sirve de nada repartir los intentos
 * entre varias direcciones, y una IP compartida (una oficina) no arrastra a
 * todos sus usuarios.
 */
export function segundosDeBloqueo(usuario, ahora = new Date()) {
  if (!usuario?.bloqueadoHasta) return 0;
  const restante = Math.ceil((new Date(usuario.bloqueadoHasta).getTime() - ahora.getTime()) / 1000);
  return restante > 0 ? restante : 0;
}

/** ¿Está bloqueada en este momento? */
export function estaBloqueada(usuario, ahora = new Date()) {
  return segundosDeBloqueo(usuario, ahora) > 0;
}

/** Campos que se guardan al dar por buenas las credenciales. */
export function limpiarIntentos() {
  return { intentosFallidos: 0, bloqueadoHasta: null };
}

/**
 * Suma un intento fallido y bloquea la cuenta al llegar al tope.
 * Devuelve los campos a guardar y si el bloqueo acaba de empezar.
 */
export function registrarIntentoFallido(usuario) {
  const intentos = Number(usuario?.intentosFallidos || 0) + 1;
  const tope = Math.max(1, Number(config.cuenta.intentosMaximos) || 8);

  if (intentos >= tope) {
    return {
      intentosFallidos: intentos,
      bloqueadoHasta: new Date(Date.now() + config.cuenta.minutosBloqueo * 60_000).toISOString(),
      bloqueadaAhora: true,
      restantes: 0
    };
  }

  return { intentosFallidos: intentos, bloqueadoHasta: null, bloqueadaAhora: false, restantes: tope - intentos };
}

export function validarEntrada(datos = {}, { parcial = false } = {}) {
  const v = recolector();
  const salida = {};

  const username = v.texto(datos.username, 'username', { requerido: !parcial, max: 60 });
  if (username) salida.username = username.toLowerCase();

  const nombre = v.texto(datos.nombre, 'nombre', { requerido: !parcial, max: LIMITES_TEXTO.titulo });
  if (nombre) salida.nombre = nombre;

  if (!parcial || datos.rol !== undefined) {
    salida.rol = v.enumeracion(datos.rol, 'rol', ROLES_PERSONAL, { requerido: !parcial });
  }
  if (datos.correo !== undefined) {
    salida.correo = datos.correo ? normalizarCorreo(datos.correo) || null : null;
  }
  if (datos.pseudonimo !== undefined) salida.pseudonimo = datos.pseudonimo === true;
  if (datos.municipioId !== undefined) {
    salida.municipioId = datos.municipioId ? String(datos.municipioId) : null;
  }
  if (datos.activo !== undefined) salida.activo = datos.activo !== false;

  v.terminar();
  return salida;
}

/**
 * Valida el alta de una cuenta ciudadana (correo + contraseña).
 * El nombre es opcional cuando se pide un pseudónimo: en ese caso lo genera
 * el servicio y llega ya resuelto en `nombre`.
 */
export function validarRegistro(datos = {}) {
  const v = recolector();

  const correo = normalizarCorreo(datos.correo);
  if (!correo) v.agregar('correo', 'Escribe un correo válido');
  else if (correo.length > LIMITES_TEXTO.correo) {
    v.agregar('correo', `No puede exceder ${LIMITES_TEXTO.correo} caracteres`);
  }

  const password = String(datos.password ?? '');
  for (const problema of problemasDePassword(password, { correo })) {
    v.agregar('password', problema);
  }

  const pseudonimo = datos.pseudonimo === true;
  const nombre = pseudonimo
    ? ''
    : v.texto(datos.nombre, 'nombre', { requerido: true, max: LIMITES_TEXTO.titulo });

  v.terminar();
  return { correo, password, nombre, pseudonimo };
}

export function construirUsuario({
  username,
  nombre,
  correo = null,
  rol,
  municipioId = null,
  passwordHash,
  pseudonimo = false
}) {
  return {
    id: nuevoId(),
    username,
    nombre,
    correo,
    rol,
    municipioId,
    activo: true,
    pseudonimo: pseudonimo === true,
    passwordHash,
    // Cuenta segura: verificación del correo, tokens de un solo uso, versión de
    // la sesión y bloqueo temporal por intentos fallidos. El personal se crea
    // desde dentro (lo da de alta un administrador), así que no verifica nada.
    correoVerificado: rol !== 'ciudadano',
    tokenVerificacionHash: null,
    tokenVerificacionExpira: null,
    resetTokenHash: null,
    resetExpira: null,
    tokenVersion: 1,
    intentosFallidos: 0,
    bloqueadoHasta: null,
    // Moderación: advertencias acumuladas y estado de la suspensión.
    advertencias: 0,
    suspendido: false,
    suspendidoHasta: null,
    suspendidoMotivo: '',
    suspendidoPor: null
  };
}

/**
 * Rellena los campos de cuenta que falten.
 *
 * Las cuentas guardadas antes de esta función no los tienen (el almacén JSON
 * no pasa por migraciones), y sin esto una cuenta antigua quedaría como «sin
 * correo verificado» y no podría entrar.
 */
export function conCamposDeCuenta(usuario) {
  if (!usuario) return usuario;
  return {
    ...usuario,
    correoVerificado: usuario.correoVerificado !== false,
    tokenVerificacionHash: usuario.tokenVerificacionHash || null,
    tokenVerificacionExpira: usuario.tokenVerificacionExpira || null,
    resetTokenHash: usuario.resetTokenHash || null,
    resetExpira: usuario.resetExpira || null,
    tokenVersion: versionDeSesion(usuario),
    intentosFallidos: Number(usuario.intentosFallidos || 0),
    bloqueadoHasta: usuario.bloqueadoHasta || null
  };
}

/**
 * ¿La cuenta está suspendida ahora mismo?
 *
 * Una suspensión con fecha deja de surtir efecto sola al cumplirse el plazo;
 * una sin fecha (`suspendidoHasta: null`) dura hasta que un moderador la
 * levante.
 */
export function estaSuspendido(usuario, ahora = new Date()) {
  if (!usuario || usuario.suspendido !== true) return false;
  if (!usuario.suspendidoHasta) return true;
  return new Date(usuario.suspendidoHasta).getTime() > ahora.getTime();
}

/** ¿Tenía fecha de fin y ya pasó? (para limpiar la marca sola) */
export function suspensionVencida(usuario, ahora = new Date()) {
  if (!usuario || usuario.suspendido !== true || !usuario.suspendidoHasta) return false;
  return new Date(usuario.suspendidoHasta).getTime() <= ahora.getTime();
}

/** Mensaje único para comunicar una suspensión (login y middleware de sesión). */
export function mensajeSuspension(usuario) {
  const plazo = usuario.suspendidoHasta
    ? `Hasta el ${String(usuario.suspendidoHasta).slice(0, 10)}.`
    : 'Es indefinida.';
  const motivo = usuario.suspendidoMotivo ? ` Motivo: ${usuario.suspendidoMotivo}.` : '';
  return `Tu cuenta está suspendida por moderación. ${plazo}${motivo}`;
}

/** Campos que se limpian al reactivar una cuenta sancionada. */
export function limpiarSancion() {
  return {
    suspendido: false,
    suspendidoHasta: null,
    suspendidoMotivo: '',
    suspendidoPor: null,
    // «Al reactivar la cuenta el contador vuelve a 0»: si no, la primera
    // advertencia nueva volvería a bloquearla de inmediato.
    advertencias: 0
  };
}
