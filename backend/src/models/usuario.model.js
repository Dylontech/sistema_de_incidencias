/**
 * MODELO: Usuario.
 * Las contraseñas se guardan siempre con bcrypt (el monolito las tenía en claro).
 */
import bcrypt from 'bcryptjs';
import { ROLES, LIMITES_TEXTO } from '../config/constantes.js';
import { recolector } from '../utils/validacion.js';
import { nuevoId } from '../utils/ids.js';

const RONDAS = 10;

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
    municipioId: usuario.municipioId || null
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
    salida.rol = v.enumeracion(datos.rol, 'rol', ROLES.filter((r) => r !== 'anonimo'), { requerido: !parcial });
  }
  if (datos.municipioId !== undefined) {
    salida.municipioId = datos.municipioId ? String(datos.municipioId) : null;
  }
  if (datos.activo !== undefined) salida.activo = datos.activo !== false;

  v.terminar();
  return salida;
}

export function construirUsuario({ username, nombre, rol, municipioId = null, passwordHash }) {
  return {
    id: nuevoId(),
    username,
    nombre,
    rol,
    municipioId,
    activo: true,
    passwordHash
  };
}
