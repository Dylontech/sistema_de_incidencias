/**
 * MODELO: Usuario.
 * Las contraseñas se guardan siempre con bcrypt (el monolito las tenía en claro).
 */
import bcrypt from 'bcryptjs';
import { ROLES_PERSONAL, LIMITES_TEXTO } from '../config/constantes.js';
import { recolector } from '../utils/validacion.js';
import { nuevoId } from '../utils/ids.js';

const RONDAS = 10;

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

/** Representación segura para la API (sin hash de contraseña). */
export function publico(usuario) {
  if (!usuario) return null;
  const { passwordHash, password, passwordInicial, ...resto } = usuario;
  return resto;
}

/** Datos que viajan dentro del token y del objeto `req.usuario`. */
export function paraSesion(usuario) {
  return {
    username: usuario.username,
    nombre: usuario.nombre,
    rol: usuario.rol,
    municipioId: usuario.municipioId || null,
    correo: usuario.correo || null
  };
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
  if (password.length < LIMITES_TEXTO.passwordMin) {
    v.agregar('password', `Debe tener al menos ${LIMITES_TEXTO.passwordMin} caracteres`);
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
    passwordHash
  };
}
