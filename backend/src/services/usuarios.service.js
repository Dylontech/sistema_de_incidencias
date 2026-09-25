/**
 * SERVICIO: cuentas del personal (funcionario y administrador).
 *
 * El ciudadano se registra por su cuenta (`auth.service.registrarCiudadano`),
 * pero las cuentas de funcionario/administrador las crea y mantiene un
 * administrador desde el panel: son llaves de acceso al municipio, no algo que
 * cualquiera pueda abrirse.
 */
import { AppError } from '../utils/AppError.js';
import { LIMITES_TEXTO, ROLES_PERSONAL } from '../config/constantes.js';
import {
  construirUsuario,
  hashearPassword,
  publico,
  validarEntrada
} from '../models/usuario.model.js';

/** Contraseña obligatoria al crear y, si viene, también al editar. */
function exigirPassword(password) {
  const limpio = String(password ?? '');
  if (limpio.length < LIMITES_TEXTO.passwordMin) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo: 'password', mensaje: `Debe tener al menos ${LIMITES_TEXTO.passwordMin} caracteres` }
    ]);
  }
  return limpio;
}

async function exigirUsernameLibre(repositorio, username) {
  if (await repositorio.usuarioPorUsername(username)) {
    throw AppError.conflicto('Ya existe un usuario con ese nombre de acceso');
  }
}

/** Un funcionario necesita un municipio real; el admin puede no tener ninguno. */
async function validarMunicipio(repositorio, rol, municipioId) {
  if (!municipioId) {
    if (rol === 'funcionario') {
      throw AppError.solicitudInvalida('Elige el municipio del funcionario');
    }
    return null;
  }
  const municipio = await repositorio.municipioPorId(municipioId);
  if (!municipio) throw AppError.solicitudInvalida('Municipio no encontrado');
  return municipio.id;
}

/** Cuántos administradores activos quedan (para no dejar el panel sin acceso). */
async function administradoresActivos(repositorio, { exceptoId = null } = {}) {
  const usuarios = await repositorio.todosLosUsuarios();
  return usuarios.filter(
    (u) => u.rol === 'admin' && u.activo !== false && u.id !== exceptoId
  ).length;
}

/** Listado del panel: solo cuentas del personal (los ciudadanos no se exponen). */
export async function listar(repositorio) {
  const usuarios = await repositorio.todosLosUsuarios();
  return usuarios.filter((u) => ROLES_PERSONAL.includes(u.rol)).map(publico);
}

/** Alta de un funcionario o administrador. */
export async function crear(repositorio, datos = {}) {
  const entrada = validarEntrada(datos);
  await exigirUsernameLibre(repositorio, entrada.username);
  const password = exigirPassword(datos.password);
  const municipioId = await validarMunicipio(repositorio, entrada.rol, entrada.municipioId);

  const usuario = construirUsuario({
    username: entrada.username,
    nombre: entrada.nombre,
    correo: entrada.correo ?? null,
    rol: entrada.rol,
    municipioId,
    passwordHash: await hashearPassword(password)
  });

  return publico(await repositorio.crearUsuario(usuario));
}

/**
 * Edición de una cuenta del personal: nombre, rol, municipio, correo, estado y
 * (opcionalmente) contraseña. El `username` no se toca nunca: es la llave de
 * acceso y el `userKey` que da autoría a sus reportes.
 */
export async function actualizar(repositorio, actor, id, datos = {}) {
  const actual = await repositorio.usuarioPorId(id);
  if (!actual) throw AppError.noEncontrado('Usuario no encontrado');
  if (!ROLES_PERSONAL.includes(actual.rol)) {
    throw AppError.prohibido('Esa cuenta no es del personal del municipio');
  }

  const cambios = validarEntrada(datos, { parcial: true });
  delete cambios.username;
  delete cambios.pseudonimo;

  const rol = cambios.rol || actual.rol;
  if (cambios.municipioId !== undefined || cambios.rol) {
    cambios.municipioId = await validarMunicipio(repositorio, rol, cambios.municipioId ?? actual.municipioId);
  }

  // Nunca quedarse sin acceso al panel: ni desactivándose uno mismo ni con el
  // último administrador activo.
  if (cambios.activo === false || (cambios.rol && cambios.rol !== 'admin')) {
    if (actor?.id === actual.id || actor?.username === actual.username) {
      throw AppError.conflicto('No puedes quitarte a ti mismo el acceso de administrador');
    }
    if (actual.rol === 'admin' && (await administradoresActivos(repositorio, { exceptoId: id })) === 0) {
      throw AppError.conflicto('Debe quedar al menos un administrador activo');
    }
  }

  if (datos.password) cambios.passwordHash = await hashearPassword(exigirPassword(datos.password));

  const actualizado = await repositorio.actualizarUsuario(id, cambios);
  return publico(actualizado);
}
