/**
 * SERVICIO: Autenticación.
 *
 * Sustituye al `Auth` del monolito, que validaba credenciales en el navegador
 * contra localStorage (contraseñas en claro y permisos manipulables).
 * Aquí las contraseñas se verifican con bcrypt y el rol/municipio viajan
 * firmados dentro del JWT.
 */
import { AppError } from '../utils/AppError.js';
import { firmarToken } from '../utils/jwt.js';
import { nuevoId } from '../utils/ids.js';
import { verificarPassword } from '../models/usuario.model.js';
import { coincideClave } from '../models/municipio.model.js';
import { MUNICIPIO_DEFAULT } from '../config/constantes.js';

const PATRON_ANON = /^[a-zA-Z0-9_-]{6,64}$/;

/** Contexto del usuario que se inyecta en `req.usuario`. */
function contexto({ username, nombre, rol, municipioId, userKey }) {
  return { username, nombre, rol, municipioId: municipioId || null, userKey };
}

function sesion({ usuario, municipioActivo = null }) {
  return {
    token: firmarToken({
      sub: usuario.username,
      username: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
      municipioId: usuario.municipioId || null,
      userKey: usuario.userKey
    }),
    usuario: {
      username: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
      municipioId: usuario.municipioId || null,
      userKey: usuario.userKey,
      esAnonimo: usuario.rol === 'anonimo'
    },
    municipioActivo
  };
}

/**
 * Municipio que se propone para centrar el mapa según la sesión.
 * El catálogo ya no empieza por Maravatío (ahora está ordenado por nombre y
 * arranca en Acuitzio), así que el valor por omisión se declara en constantes.
 */
async function municipioSugerido(repositorio, usuario) {
  if (usuario.municipioId) {
    const propio = await repositorio.municipioPorId(usuario.municipioId);
    if (propio) return propio;
  }
  const municipios = await repositorio.todosMunicipios();
  return municipios.find((m) => m.id === MUNICIPIO_DEFAULT) || municipios[0] || null;
}

/**
 * Entrada como ciudadano anónimo.
 * `anonId` lo conserva el navegador (como el viejo localStorage.anon_id) para
 * que el ciudadano siga viendo sus propios reportes en visitas posteriores.
 */
export async function entrarAnonimo(repositorio, { anonId, municipioId } = {}) {
  const id = PATRON_ANON.test(String(anonId || '')) ? String(anonId) : nuevoId();
  const municipios = await repositorio.todosMunicipios();
  const elegido =
    municipios.find((m) => m.id === municipioId) ||
    municipios.find((m) => m.id === MUNICIPIO_DEFAULT) ||
    municipios[0] ||
    null;

  const usuario = {
    username: `anonimo_${id}`,
    nombre: 'Ciudadano anónimo',
    rol: 'anonimo',
    municipioId: elegido ? elegido.id : null,
    userKey: `anon_${id}`
  };

  return { ...sesion({ usuario, municipioActivo: elegido }), anonId: id };
}

/** Login de funcionario: usuario + contraseña + clave del municipio. */
export async function entrarFuncionario(repositorio, { username, password, claveMunicipio }) {
  if (!username || !password || !claveMunicipio) {
    throw AppError.solicitudInvalida('Completa todos los campos');
  }

  const encontrado = await repositorio.usuarioPorUsername(username);
  if (!encontrado || encontrado.rol !== 'funcionario' || encontrado.activo === false) {
    throw AppError.noAutenticado('Credenciales incorrectas');
  }
  if (!(await verificarPassword(encontrado, password))) {
    throw AppError.noAutenticado('Credenciales incorrectas');
  }

  const municipio = await repositorio.municipioPorClave(claveMunicipio);
  if (!municipio) {
    throw AppError.noAutenticado('Clave de municipio incorrecta');
  }
  if (encontrado.municipioId && encontrado.municipioId !== municipio.id) {
    throw AppError.prohibido('No tienes acceso a este municipio');
  }

  const usuario = {
    username: encontrado.username,
    nombre: encontrado.nombre,
    rol: 'funcionario',
    municipioId: municipio.id,
    userKey: encontrado.username
  };

  return sesion({ usuario, municipioActivo: municipio });
}

/** Login de administrador (sin municipio fijo: ve todos hasta elegir uno). */
export async function entrarAdmin(repositorio, { username, password }) {
  if (!username || !password) {
    throw AppError.solicitudInvalida('Completa todos los campos');
  }

  const encontrado = await repositorio.usuarioPorUsername(username);
  if (!encontrado || encontrado.rol !== 'admin' || encontrado.activo === false) {
    throw AppError.noAutenticado('Credenciales incorrectas');
  }
  if (!(await verificarPassword(encontrado, password))) {
    throw AppError.noAutenticado('Credenciales incorrectas');
  }

  const usuario = {
    username: encontrado.username,
    nombre: encontrado.nombre,
    rol: 'admin',
    municipioId: encontrado.municipioId || null, // ya no se fuerza a 'maravatio'
    userKey: encontrado.username
  };

  const municipioActivo = await municipioSugerido(repositorio, usuario);
  return sesion({ usuario, municipioActivo });
}

/** Reconstruye el contexto desde el payload de un token válido. */
export function usuarioDesdeToken(payload) {
  if (!payload) return null;
  return {
    username: payload.username,
    nombre: payload.nombre,
    rol: payload.rol,
    municipioId: payload.municipioId || null,
    userKey: payload.userKey || payload.username
  };
}

/**
 * Cambio de municipio activo (paridad con `Admin.cambiarMunicipio`, que pedía
 * la clave). Devuelve un token nuevo con el municipio actualizado.
 */
export async function cambiarMunicipioActivo(repositorio, usuario, { municipioId, clave }) {
  if (!usuario || usuario.rol === 'anonimo') {
    throw AppError.prohibido('No tienes permiso para cambiar de municipio');
  }

  const municipio = await repositorio.municipioPorId(municipioId);
  if (!municipio) throw AppError.noEncontrado('Municipio no encontrado');
  if (!coincideClave(municipio, clave)) throw AppError.solicitudInvalida('Clave incorrecta');

  if (usuario.rol === 'funcionario') {
    const completo = await repositorio.usuarioPorUsername(usuario.username);
    if (completo?.municipioId && completo.municipioId !== municipio.id) {
      throw AppError.prohibido('No tienes acceso a este municipio');
    }
  }

  const actualizado = contexto({ ...usuario, municipioId: municipio.id });
  return sesion({ usuario: actualizado, municipioActivo: municipio });
}
