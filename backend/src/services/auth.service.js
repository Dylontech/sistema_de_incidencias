/**
 * SERVICIO: Autenticación.
 *
 * Sustituye al `Auth` del monolito, que validaba credenciales en el navegador
 * contra localStorage (contraseñas en claro y permisos manipulables).
 * Aquí las contraseñas se verifican con bcrypt y el rol/municipio viajan
 * firmados dentro del JWT.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { pseudonimoAleatorio } from '../utils/pseudonimos.js';
import {
  verificarPassword,
  hashearPassword,
  normalizarCorreo,
  validarRegistro,
  construirUsuario,
  estaSuspendido,
  limpiarSancion,
  mensajeSuspension,
  suspensionVencida,
  estaBloqueada,
  segundosDeBloqueo,
  limpiarIntentos,
  registrarIntentoFallido,
  versionDeSesion
} from '../models/usuario.model.js';
import { coincideClave } from '../models/municipio.model.js';
import { MUNICIPIO_DEFAULT } from '../config/constantes.js';
import { config } from '../config/index.js';
import { contexto, contextoCiudadano, sesion } from './sesion.service.js';
import { emitirVerificacion } from './cuenta.service.js';

const PATRON_ANON = /^[a-zA-Z0-9_-]{6,64}$/;

/**
 * Corta el acceso de una cuenta suspendida por moderación.
 *
 * Se comprueba **después** de validar la contraseña: suspender a alguien no
 * debe revelar a un desconocido que la cuenta existe. Si la suspensión tenía
 * fecha de fin y ya pasó, se levanta sola y se deja entrar.
 */
async function exigirCuentaHabilitada(repositorio, cuenta) {
  if (suspensionVencida(cuenta)) {
    await repositorio.actualizarUsuario(cuenta.id, limpiarSancion());
    return;
  }
  if (estaSuspendido(cuenta)) throw AppError.prohibido(mensajeSuspension(cuenta));
}

/**
 * Corta el acceso mientras la cuenta esté bloqueada por intentos fallidos.
 *
 * Se comprueba **antes** de mirar la contraseña, que es lo único que frena la
 * fuerza bruta. El precio es que quien ataca puede deducir que la cuenta existe
 * (si no existiera no habría nada que bloquear); se acepta porque el registro
 * ya responde «ya existe una cuenta con ese correo» y porque lo que está en
 * juego aquí es que no se pueda adivinar una contraseña a base de reintentos.
 */
function exigirCuentaSinBloqueo(cuenta) {
  if (!estaBloqueada(cuenta)) return;
  const segundos = segundosDeBloqueo(cuenta);
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  throw AppError.demasiadasPeticiones(
    `Demasiados intentos fallidos. Vuelve a intentarlo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`,
    { reintentarEnSegundos: segundos }
  );
}

/**
 * Anota un intento fallido y devuelve el error que hay que lanzar.
 * El mensaje es siempre el mismo tanto si la cuenta existe como si no: lo único
 * que cambia es que, al agotar los intentos, la cuenta queda bloqueada un rato.
 */
async function errorPorCredenciales(repositorio, cuenta, mensaje) {
  if (!cuenta) return AppError.noAutenticado(mensaje);

  const estado = registrarIntentoFallido(cuenta);
  await repositorio.actualizarUsuario(cuenta.id, {
    intentosFallidos: estado.intentosFallidos,
    bloqueadoHasta: estado.bloqueadoHasta
  });

  if (estado.bloqueadaAhora) {
    const minutos = Math.max(1, Number(config.cuenta.minutosBloqueo) || 15);
    return AppError.demasiadasPeticiones(
      `Demasiados intentos fallidos. La cuenta queda bloqueada ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`,
      { reintentarEnSegundos: minutos * 60 }
    );
  }
  return AppError.noAutenticado(mensaje);
}

/** Da por buenas las credenciales: se olvidan los intentos fallidos. */
async function olvidarIntentos(repositorio, cuenta) {
  if (Number(cuenta?.intentosFallidos || 0) > 0) {
    await repositorio.actualizarUsuario(cuenta.id, limpiarIntentos());
  }
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
 *
 * Esta sesión NO tiene buzón: sin cuenta no hay a quién avisar de que el
 * reporte cambió de estado (decisión del sistema de cuentas). Para recibir
 * avisos hay que registrarse con correo o abrir una cuenta ciudadana.
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

/**
 * Username interno de una cuenta ciudadana.
 *
 * Es opaco y aleatorio a propósito: el `userKey` de sus reportes viaja en el
 * listado público, así que no puede contener el correo ni el nombre real.
 */
function usernameCiudadano() {
  return `cdad_${nuevoId().replace(/-/g, '').slice(0, 10)}`;
}

/**
 * Alta de cuenta ciudadana: correo + contraseña, con nombre real o pseudónimo.
 *
 * Quien se registra deja de ser «anónimo» para el sistema: sus reportes siguen
 * pudiendo mostrarse sin nombre (lo decide en cada reporte), pero sí recibe
 * avisos de seguimiento porque ya hay un buzón al que dirigirlos.
 */
export async function registrarCiudadano(repositorio, datos = {}) {
  const limpio = validarRegistro(datos);

  if (await repositorio.usuarioPorCorreo(limpio.correo)) {
    throw AppError.conflicto('Ya existe una cuenta con ese correo');
  }

  const usuario = construirUsuario({
    username: usernameCiudadano(),
    // Nombre real o pseudónimo generado («Águila Nocturna»). El pseudónimo se
    // sortea aquí, en el servidor, para que nadie pueda elegir el de otro.
    nombre: limpio.pseudonimo ? pseudonimoAleatorio() : limpio.nombre,
    correo: limpio.correo,
    rol: 'ciudadano',
    passwordHash: await hashearPassword(limpio.password),
    pseudonimo: limpio.pseudonimo
  });

  await repositorio.crearUsuario(usuario);

  // El enlace de confirmación sale ya: hasta que se abra, la cuenta no sirve
  // para entrar. Si no se exigiera, cualquiera podría registrarse con el correo
  // de otra persona y quedarse con sus avisos.
  await emitirVerificacion(repositorio, usuario);

  if (config.cuenta.exigirCorreoVerificado) {
    // Sin sesión: el ciudadano entra cuando confirme. Devolver un token aquí
    // dejaría pasar justo a quien todavía no ha demostrado que el correo es suyo.
    return {
      requiereVerificacion: true,
      correo: usuario.correo,
      mensaje: `Te hemos enviado un enlace a ${usuario.correo}. Ábrelo para activar la cuenta.`
    };
  }

  // La cuenta nueva se queda en el municipio que el ciudadano estaba viendo.
  const municipioActivo =
    (datos.municipioId ? await repositorio.municipioPorId(datos.municipioId) : null) ||
    (await municipioSugerido(repositorio, usuario));
  return sesion({ usuario: contextoCiudadano(usuario), municipioActivo });
}

/** Entrada de una cuenta ciudadana (correo + contraseña). */
export async function entrarCiudadano(repositorio, { correo, password, municipioId } = {}) {
  if (!correo || !password) throw AppError.solicitudInvalida('Completa todos los campos');

  // Un solo mensaje para «no existe», «contraseña mal» y «no es ciudadana».
  const noValidas = 'Correo o contraseña incorrectos';
  const email = normalizarCorreo(correo);
  const encontrado = email ? await repositorio.usuarioPorCorreo(email) : null;
  const cuenta =
    encontrado && encontrado.rol === 'ciudadano' && encontrado.activo !== false ? encontrado : null;

  if (cuenta) exigirCuentaSinBloqueo(cuenta);

  if (!cuenta || !(await verificarPassword(cuenta, password))) {
    throw await errorPorCredenciales(repositorio, cuenta, noValidas);
  }

  // El correo sin confirmar se avisa DESPUÉS de comprobar la contraseña: así
  // nadie descubre que la cuenta existe sin saber ya la contraseña.
  if (config.cuenta.exigirCorreoVerificado && cuenta.correoVerificado === false) {
    throw AppError.prohibido(
      'Todavía no has confirmado tu correo. Abre el enlace que te enviamos o pide que te lo reenviemos.'
    );
  }

  await exigirCuentaHabilitada(repositorio, cuenta);
  await olvidarIntentos(repositorio, cuenta);

  const usuario = contextoCiudadano(cuenta);
  // El ciudadano conserva el municipio que estaba viendo en este dispositivo.
  const activo =
    (municipioId ? await repositorio.municipioPorId(municipioId) : null) ||
    (await municipioSugerido(repositorio, usuario));
  return sesion({ usuario, municipioActivo: activo });
}

/** Login de funcionario: usuario + contraseña + clave del municipio. */export async function entrarFuncionario(repositorio, { username, password, claveMunicipio }) {
  if (!username || !password || !claveMunicipio) {
    throw AppError.solicitudInvalida('Completa todos los campos');
  }

  const encontrado = await repositorio.usuarioPorUsername(username);
  const cuenta =
    encontrado && encontrado.rol === 'funcionario' && encontrado.activo !== false ? encontrado : null;

  if (cuenta) exigirCuentaSinBloqueo(cuenta);

  // La clave del municipio se comprueba antes de dar la contraseña por mala:
  // si no, un intento sin clave válida contaría como fallo de contraseña y
  // bloquearía la cuenta a quien solo se equivocó de municipio.
  const municipio = await repositorio.municipioPorClave(claveMunicipio);
  if (!municipio) {
    throw AppError.noAutenticado('Clave de municipio incorrecta');
  }

  if (!cuenta || !(await verificarPassword(cuenta, password))) {
    throw await errorPorCredenciales(repositorio, cuenta, 'Credenciales incorrectas');
  }
  await exigirCuentaHabilitada(repositorio, cuenta);
  await olvidarIntentos(repositorio, cuenta);

  if (cuenta.municipioId && cuenta.municipioId !== municipio.id) {
    throw AppError.prohibido('No tienes acceso a este municipio');
  }

  const usuario = contexto({
    username: cuenta.username,
    nombre: cuenta.nombre,
    rol: 'funcionario',
    municipioId: municipio.id,
    userKey: cuenta.username,
    version: versionDeSesion(cuenta)
  });

  return sesion({ usuario, municipioActivo: municipio });
}

/** Login de administrador (sin municipio fijo: ve todos hasta elegir uno). */
export async function entrarAdmin(repositorio, { username, password }) {
  if (!username || !password) {
    throw AppError.solicitudInvalida('Completa todos los campos');
  }

  const encontrado = await repositorio.usuarioPorUsername(username);
  const cuenta =
    encontrado && encontrado.rol === 'admin' && encontrado.activo !== false ? encontrado : null;

  if (cuenta) exigirCuentaSinBloqueo(cuenta);

  if (!cuenta || !(await verificarPassword(cuenta, password))) {
    throw await errorPorCredenciales(repositorio, cuenta, 'Credenciales incorrectas');
  }
  await exigirCuentaHabilitada(repositorio, cuenta);
  await olvidarIntentos(repositorio, cuenta);

  const usuario = contexto({
    username: cuenta.username,
    nombre: cuenta.nombre,
    rol: 'admin',
    municipioId: cuenta.municipioId || null, // ya no se fuerza a 'maravatio'
    userKey: cuenta.username,
    version: versionDeSesion(cuenta)
  });

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
    correo: payload.correo || null,
    userKey: payload.userKey || payload.username,
    // Versión de la sesión con la que se firmó: el middleware la compara con la
    // guardada en la cuenta para detectar tokens emitidos antes de un cambio de
    // contraseña.
    version: Number(payload.v) || 1
  };
}

/**
 * Cambio de municipio activo (paridad con `Admin.cambiarMunicipio`, que pedía
 * la clave). Devuelve un token nuevo con el municipio actualizado.
 *
 * El ciudadano registrado navega el catálogo como el anónimo, así que no se le
 * pide clave; el funcionario sigue atado a su municipio y el admin sí la pide.
 */
export async function cambiarMunicipioActivo(repositorio, usuario, { municipioId, clave }) {
  if (!usuario || usuario.rol === 'anonimo') {
    throw AppError.prohibido('No tienes permiso para cambiar de municipio');
  }

  const municipio = await repositorio.municipioPorId(municipioId);
  if (!municipio) throw AppError.noEncontrado('Municipio no encontrado');

  if (usuario.rol !== 'ciudadano') {
    if (!coincideClave(municipio, clave)) throw AppError.solicitudInvalida('Clave incorrecta');
  }
  if (usuario.rol === 'funcionario') {
    const completo = await repositorio.usuarioPorUsername(usuario.username);
    if (completo?.municipioId && completo.municipioId !== municipio.id) {
      throw AppError.prohibido('No tienes acceso a este municipio');
    }
  }

  const actualizado = contexto({ ...usuario, municipioId: municipio.id });
  return sesion({ usuario: actualizado, municipioActivo: municipio });
}
