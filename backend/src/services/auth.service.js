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
import { pseudonimoUnico } from '../utils/pseudonimos.js';
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
  puedeEscribirDe
} from '../models/usuario.model.js';
import { coincideClave } from '../models/municipio.model.js';
import { MUNICIPIO_DEFAULT, ROLES_ADMIN, ROLES_PERSONAL } from '../config/constantes.js';
import { config } from '../config/index.js';
import { permisosDe } from './permisos.service.js';
import { valor as valorConfig } from './configuracion.service.js';
import * as claves from './claves.service.js';
import * as cuentas from './cuenta.service.js';
import { cifrarPassword } from '../utils/cifrado.js';

const PATRON_ANON = /^[a-zA-Z0-9_-]{6,64}$/;

/**
 * ¿El código escrito es una clave de acceso vigente?
 *
 * El formulario del personal tiene un solo campo: puede llevar la clave que
 * genera el panel (cubre uno o varios municipios) o la clave geoestadística de
 * un municipio asignado, que es como entraban las cuentas antiguas. Aquí se
 * intenta la primera y, si no lo es, se devuelve `null` para que el login lo
 * pruebe como clave de municipio.
 */
async function claveValida(repositorio, codigo) {
  try {
    return await claves.validar(repositorio, codigo);
  } catch {
    return null;
  }
}

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
    return false;
  }
  if (estaSuspendido(cuenta)) {
    // La congelación por inactividad se levanta con el login correcto; las
    // sanciones de moderación y la congelación voluntaria siguen bloqueando.
    if (cuenta.suspendidoOrigen === 'inactividad') {
      await repositorio.actualizarUsuario(cuenta.id, limpiarSancion());
      return true;
    }
    throw AppError.prohibido(mensajeSuspension(cuenta));
  }
  return false;
}

/** El correo es obligatorio para las cuentas que se registran por su cuenta. */
function exigirCorreoVerificado(cuenta) {
  if (cuenta?.correoVerificado === false) {
    throw new AppError(403, 'Confirma tu correo para activar la cuenta', [
      {
        codigo: 'correo_no_verificado',
        correo: cuenta.correo || null,
        puedeReenviar: true
      }
    ]);
  }
}

/** Busca una cuenta por su nombre de usuario o por su correo. */
async function usuarioPorIdentificador(repositorio, identificador) {
  const texto = String(identificador || '').trim();
  if (!texto) return null;
  if (texto.includes('@')) {
    const correo = normalizarCorreo(texto);
    return correo ? repositorio.usuarioPorCorreo(correo) : null;
  }
  return repositorio.usuarioPorUsername(texto);
}

/** Contexto del usuario que se inyecta en `req.usuario`. */
function contexto({ username, nombre, rol, municipioId, userKey, permisos = {} }) {
  return { username, nombre, rol, municipioId: municipioId || null, userKey, permisos };
}

function sesion({ usuario, municipioActivo = null, claveId = null }) {
  const esPersonal = ROLES_PERSONAL.includes(usuario.rol);
  const puedeEscribir = puedeEscribirDe(usuario);
  const permisos = permisosDe(usuario);
  const puedeAtenderTickets =
    esPersonal && (usuario.rol === 'admin' || permisos.includes('atender_tickets'));
  const idSesion = nuevoId();
  return {
    token: firmarToken({
      sub: usuario.username,
      username: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
      municipioId: usuario.municipioId || null,
      correo: usuario.correo || null,
      userKey: usuario.userKey,
      jti: idSesion,
      claveId: claveId || null
    }),
    usuario: {
      id: usuario.id || null,
      username: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
      municipioId: usuario.municipioId || null,
      correo: usuario.correo || null,
      userKey: usuario.userKey,
      claveId: claveId || null,
      claveActivadaEn: usuario.claveActivadaEn || null,
      claveVigenteHasta: usuario.claveVigenteHasta || null,
      claveObligatoria: usuario.claveObligatoria === true,
      correoVerificado: usuario.correoVerificado !== false,
      suspendidoHasta: usuario.suspendidoHasta || null,
      suspendidoOrigen: usuario.suspendidoOrigen || null,
      creadoEn: usuario.creadoEn || null,
      pseudonimo: usuario.pseudonimo === true,
      esAnonimo: usuario.rol === 'anonimo',
      esPersonal,
      puedeEscribir,
      soloLectura: esPersonal && !puedeEscribir,
      puedeAtenderTickets,
      municipios: Array.isArray(usuario.municipios) ? usuario.municipios : [],
      estados: Array.isArray(usuario.estados) ? usuario.estados : [],
      permisos
    },
    municipioActivo
  };
}

/**
 * Municipio que se propone para centrar el mapa según la sesión.
 * El personal usa su primera asignación (o un municipio de su estado); el
 * ciudadano conserva el comportamiento anterior.
 */
async function municipioSugerido(repositorio, usuario) {
  const municipios = Array.isArray(usuario.municipios)
    ? usuario.municipios
    : usuario.municipioId
      ? [usuario.municipioId]
      : [];

  for (const id of municipios) {
    const propio = await repositorio.municipioPorId(id);
    if (propio) return propio;
  }

  if (Array.isArray(usuario.estados) && usuario.estados.length) {
    const todos = await repositorio.todosMunicipios();
    const delEstado = todos.find((m) => usuario.estados.includes(m.estado));
    if (delEstado) return delEstado;
  }

  if (usuario.municipioId) {
    const propio = await repositorio.municipioPorId(usuario.municipioId);
    if (propio) return propio;
  }

  const municipiosCatalogo = await repositorio.todosMunicipios();
  return (
    municipiosCatalogo.find((m) => m.id === MUNICIPIO_DEFAULT) || municipiosCatalogo[0] || null
  );
}

/** Contexto completo de una cuenta de personal (rol + asignaciones). */
async function contextoPersonal(repositorio, cuenta) {
  const asignaciones = await repositorio.alcanceDeUsuario(cuenta.id);
  const municipios = asignaciones.municipios.length
    ? asignaciones.municipios
    : cuenta.municipioId
      ? [cuenta.municipioId]
      : [];

  return {
    id: cuenta.id,
    username: cuenta.username,
    nombre: cuenta.nombre,
    correo: cuenta.correo || null,
    rol: cuenta.rol,
    municipioId: cuenta.municipioId || null,
    userKey: cuenta.username,
    puedeEscribir: puedeEscribirDe(cuenta),
    permisos: cuenta.permisos || {},
    rolPersonalizado: cuenta.rolPersonalizado || null,
    municipios,
    estados: asignaciones.estados,
    claveId: cuenta.claveId || null,
    claveActivadaEn: cuenta.claveActivadaEn || null,
    claveVigenteHasta: cuenta.claveVigenteHasta || null,
    claveObligatoria: cuenta.claveObligatoria === true,
    correoVerificado: cuenta.correoVerificado !== false,
    suspendidoHasta: cuenta.suspendidoHasta || null,
    suspendidoOrigen: cuenta.suspendidoOrigen || null,
    creadoEn: cuenta.creadoEn || null
  };
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

/** Contexto de sesión de una cuenta ciudadana ya guardada. */
function contextoCiudadano(usuario) {
  return {
    id: usuario.id || null,
    username: usuario.username,
    nombre: usuario.nombre,
    rol: 'ciudadano',
    municipioId: usuario.municipioId || null,
    correo: usuario.correo || null,
    userKey: usuario.username,
    pseudonimo: usuario.pseudonimo === true,
    correoVerificado: usuario.correoVerificado !== false,
    suspendidoHasta: usuario.suspendidoHasta || null,
    suspendidoOrigen: usuario.suspendidoOrigen || null,
    creadoEn: usuario.creadoEn || null,
    permisos: usuario.permisos || {}
  };
}

/**
 * Pseudónimo nuevo que no esté en uso por otra cuenta ciudadana.
 * El nombre es la credencial de acceso, así que el pseudónimo también debe ser
 * único (ver `pseudonimoUnico`).
 */
async function pseudonimoLibre(repositorio) {
  const cuentas = await repositorio.todosLosUsuarios();
  const existentes = cuentas
    .filter((cuenta) => cuenta.rol === 'ciudadano')
    .map((cuenta) => cuenta.nombre);
  return pseudonimoUnico({ existentes });
}

/**
 * Alta de cuenta ciudadana: correo de contacto + contraseña, con nombre real o
 * pseudónimo.
 *
 * El nombre (o el pseudónimo sorteado) es la credencial de acceso, así que no
 * puede repetirse entre ciudadanos. El correo sigue siendo el canal de avisos:
 * cada correo pertenece a una sola cuenta (índice único en la base).
 */
export async function registrarCiudadano(repositorio, datos = {}) {
  const limpio = validarRegistro(datos);
  const activacion = await valorConfig(repositorio, 'cuentas.activacion_ciudadano');
  const exigirVerificacion = activacion === 'correo';

  // El correo es único: si ya está registrado, los avisos llegarían a otra
  // persona. Se comprueba antes de crear la cuenta (y la base lo respalda).
  if (await repositorio.usuarioPorCorreo(limpio.correo)) {
    throw AppError.conflicto(
      'Ese correo ya está registrado en otra cuenta. Usa otro correo o entra con tu nombre o correo.'
    );
  }

  // El pseudónimo se sortea en el servidor, libre de colisiones, para que
  // nadie pueda elegir el de otro ni repetir uno existente.
  const nombre = limpio.pseudonimo ? await pseudonimoLibre(repositorio) : limpio.nombre;

  if (!limpio.pseudonimo && (await repositorio.usuariosPorNombre(nombre)).length) {
    throw AppError.conflicto('Ese nombre ya está en uso. Elige otro o usa un nombre generado.');
  }

  const usuario = construirUsuario({
    username: usernameCiudadano(),
    nombre,
    correo: limpio.correo,
    rol: 'ciudadano',
    passwordHash: await hashearPassword(limpio.password),
    // Copia cifrada para que la administración pueda consultarla o
    // restablecerla con registro en auditoría (V2.11).
    passwordCifrada: cifrarPassword(limpio.password),
    pseudonimo: limpio.pseudonimo,
    correoVerificado: !exigirVerificacion,
    correoVerificadoEn: exigirVerificacion ? null : new Date().toISOString(),
    claveObligatoria: false
  });

  try {
    await repositorio.crearUsuario(usuario);
  } catch (error) {
    // Dos altas simultáneas con el mismo correo: la comprobación anterior
    // puede pasar en ambas y la base rechaza la segunda.
    if (error?.code === 'ER_DUP_ENTRY' && /correo/i.test(error.message || '')) {
      throw AppError.conflicto(
        'Ese correo ya está registrado en otra cuenta. Usa otro correo o entra con tu nombre o correo.'
      );
    }
    throw error;
  }

  if (exigirVerificacion) {
    await cuentas.emitirVerificacionCuenta(repositorio, usuario, {
      ip: datos.ip || null,
      userAgent: datos.userAgent || ''
    });
    return {
      pendienteVerificacion: true,
      correo: usuario.correo,
      nombre: usuario.nombre,
      username: usuario.username
    };
  }

  // La cuenta nueva se queda en el municipio que el ciudadano estaba viendo.
  const municipioActivo =
    (datos.municipioId ? await repositorio.municipioPorId(datos.municipioId) : null) ||
    (await municipioSugerido(repositorio, usuario));
  return sesion({ usuario: contextoCiudadano(usuario), municipioActivo });
}

/**
 * Entrada de una cuenta ciudadana con su nombre (o pseudónimo) y contraseña.
 *
 * `correo` se acepta como respaldo para las cuentas creadas antes de que el
 * acceso fuera por nombre. Las bases antiguas podían tener nombres repetidos:
 * por eso se prueba la contraseña contra cada candidato.
 */
export async function entrarCiudadano(
  repositorio,
  { nombre, correo, password, municipioId } = {}
) {
  const identificador = String(nombre || correo || '').trim();
  const pareceCorreo = identificador.includes('@');
  const email = normalizarCorreo(pareceCorreo ? identificador : correo);
  if (!password || (!identificador && !email)) {
    throw AppError.solicitudInvalida('Escribe tu nombre, correo y contraseña');
  }

  // El nombre/pseudónimo sigue siendo válido para las cuentas antiguas; el
  // correo es la vía nueva y la única que puede resolver cuentas sin nombre
  // público recordado. Los correos inválidos no se usan como nombre.
  let candidatos = [];
  if (pareceCorreo) {
    const porCorreo = email ? await repositorio.usuarioPorCorreo(email) : null;
    candidatos = porCorreo ? [porCorreo] : [];
  } else if (identificador) {
    candidatos = await repositorio.usuariosPorNombre(identificador);
  }
  if (!candidatos.length && email && !pareceCorreo) {
    const porCorreo = await repositorio.usuarioPorCorreo(email);
    candidatos = porCorreo ? [porCorreo] : [];
  }

  let encontrado = null;
  for (const cuenta of candidatos) {
    if (cuenta.rol !== 'ciudadano' || cuenta.activo === false) continue;
    if (await verificarPassword(cuenta, password)) {
      encontrado = cuenta;
      break;
    }
  }
  if (!encontrado) throw AppError.noAutenticado('Nombre, correo o contraseña incorrectos');
  exigirCorreoVerificado(encontrado);
  const reactivada = await exigirCuentaHabilitada(repositorio, encontrado);

  const usuario = contextoCiudadano(encontrado);
  // El ciudadano conserva el municipio que estaba viendo en este dispositivo.
  const activo =
    (municipioId ? await repositorio.municipioPorId(municipioId) : null) ||
    (await municipioSugerido(repositorio, usuario));
  return { ...sesion({ usuario, municipioActivo: activo }), reactivada };
}

/** Login de funcionario, auditor o enlace (personal no administrador). */
export async function entrarFuncionario(
  repositorio,
  { username, password, claveMunicipio, claveAcceso, ip } = {}
) {
  if (!username || !password) {
    throw AppError.solicitudInvalida('Completa todos los campos');
  }

  // El campo acepta el usuario o el correo de la cuenta. Así una persona que
  // fue promovida desde una cuenta ciudadana no tiene que recordar un
  // username interno que nunca vio.
  const encontrado = await usuarioPorIdentificador(repositorio, username);
  if (
    !encontrado ||
    !ROLES_PERSONAL.includes(encontrado.rol) ||
    ROLES_ADMIN.includes(encontrado.rol) ||
    encontrado.activo === false
  ) {
    throw AppError.noAutenticado('Usuario, correo o contraseña incorrectos');
  }
  if (!(await verificarPassword(encontrado, password))) {
    throw AppError.noAutenticado('Usuario, correo o contraseña incorrectos');
  }
  exigirCorreoVerificado(encontrado);
  const reactivada = await exigirCuentaHabilitada(repositorio, encontrado);

  const usuario = await contextoPersonal(repositorio, encontrado);

  const claveGuardada = encontrado.claveId
    ? await repositorio.claveAccesoPorId(encontrado.claveId)
    : null;
  const ahora = Date.now();
  const cuentaActiva =
    Boolean(claveGuardada) &&
    claves.claveVigente(claveGuardada) &&
    Boolean(encontrado.claveVigenteHasta) &&
    new Date(encontrado.claveVigenteHasta).getTime() > ahora;

  // Las cuentas nuevas de personal no reciben acceso hasta que la
  // administración les vincule una clave.
  if (encontrado.claveObligatoria === true && !encontrado.claveId) {
    throw new AppError(
      403,
      'Tu cuenta aún no tiene una clave de acceso vinculada. Pide a la administración que te asigne una.',
      [{ codigo: 'clave_no_asignada' }]
    );
  }

  let clave = null;
  if (claveAcceso) {
    // La clave escrita manda: activa la cuenta, la renueva o cambia a la clave
    // de una renovación. Una cuenta nueva obligatoria no se auto-vincula.
    try {
      clave = await claves.validarActivacion(repositorio, encontrado, claveAcceso, {
        ip,
        permitirVinculoInicial:
          encontrado.claveObligatoria !== true && !encontrado.claveId
      });
    } catch (error) {
      // El formulario histórico enviaba la clave geoestadística en el mismo
      // campo. Solo se prueba esa vía si el código no corresponde a ninguna
      // clave: una clave real expirada o revocada debe bloquear la entrada.
      const esLegada = !encontrado.claveId && encontrado.claveObligatoria !== true;
      const noEsClave =
        error?.estado === 401 && error?.detalles?.[0]?.codigo === 'clave_invalida';
      if (!esLegada || !claveMunicipio || !noEsClave) throw error;
      clave = null;
    }
  } else if (encontrado.claveId) {
    if (!claveGuardada) {
      throw new AppError(403, 'Tu clave de acceso ya no está disponible', [
        { codigo: 'clave_revocada' }
      ]);
    }
    if (claveGuardada.activa === false) {
      throw new AppError(403, 'Tu clave de acceso fue revocada', [
        { codigo: 'clave_revocada' }
      ]);
    }
    if (claveGuardada.expiraEn && new Date(claveGuardada.expiraEn).getTime() <= ahora) {
      throw new AppError(
        403,
        `Tu clave venció el ${String(claveGuardada.expiraEn).slice(0, 10)}. Ingresa la nueva clave que te entregó la administración.`,
        [{ codigo: 'clave_vencida', venceEn: claveGuardada.expiraEn }]
      );
    }
    if (!cuentaActiva) {
      throw new AppError(400, 'Escribe la clave de activación de tu cuenta', [
        {
          campo: 'claveAcceso',
          codigo: 'clave_requerida',
          venceEn: claveGuardada.expiraEn || null
        }
      ]);
    }
  }

  if (clave) {
    // La clave define el alcance de la sesión y sus permisos.
    Object.assign(usuario, claves.aplicarClaveAUsuario(usuario, clave));
  }

  const claveSesion = clave?.id || encontrado.claveId || null;

  if (usuario.rol === 'funcionario' || usuario.rol === 'auditor') {
    if (clave || cuentaActiva) {
      const municipio = await municipioSugerido(repositorio, usuario);
      if (!municipio) {
        throw AppError.prohibido(
          clave ? 'La clave no cubre ningún municipio válido' : 'La cuenta no tiene un municipio válido'
        );
      }
      usuario.municipioId = municipio.id;
      return {
        ...sesion({ usuario, municipioActivo: municipio, claveId: claveSesion }),
        reactivada
      };
    }

    // Compatibilidad con cuentas legadas sin clave.
    if (!claveMunicipio) {
      throw claveAcceso
        ? AppError.noAutenticado('Clave de acceso incorrecta')
        : AppError.solicitudInvalida('Escribe la clave de tu municipio');
    }
    const municipio = await repositorio.municipioPorClave(claveMunicipio);
    if (!municipio) throw AppError.noAutenticado('Clave de municipio incorrecta');
    if (!usuario.municipios.includes(municipio.id)) {
      throw AppError.prohibido('No tienes acceso a este municipio');
    }
    usuario.municipioId = municipio.id;
    return {
      ...sesion({ usuario, municipioActivo: municipio, claveId: claveSesion }),
      reactivada
    };
  }

  // Enlace estatal/federal y soporte: con clave se acotan a su territorio;
  // sin clave se mantiene el comportamiento anterior.
  if (clave) {
    const municipio = await municipioSugerido(repositorio, usuario);
    usuario.municipioId = municipio?.id || null;
    return {
      ...sesion({ usuario, municipioActivo: municipio || null, claveId: claveSesion }),
      reactivada
    };
  }

  const activo = await municipioSugerido(repositorio, usuario);
  usuario.municipioId = activo ? activo.id : null;
  return { ...sesion({ usuario, municipioActivo: activo, claveId: claveSesion }), reactivada };
}

/** Login de administrador (sin municipio fijo: ve todos hasta elegir uno). */
export async function entrarAdmin(repositorio, { username, password }) {
  if (!username || !password) {
    throw AppError.solicitudInvalida('Completa todos los campos');
  }

  const encontrado = await usuarioPorIdentificador(repositorio, username);
  if (!encontrado || !ROLES_ADMIN.includes(encontrado.rol) || encontrado.activo === false) {
    throw AppError.noAutenticado('Usuario, correo o contraseña incorrectos');
  }
  if (!(await verificarPassword(encontrado, password))) {
    throw AppError.noAutenticado('Usuario, correo o contraseña incorrectos');
  }
  exigirCorreoVerificado(encontrado);
  const reactivada = await exigirCuentaHabilitada(repositorio, encontrado);

  const usuario = await contextoPersonal(repositorio, encontrado);
  const municipioActivo = await municipioSugerido(repositorio, usuario);
  return { ...sesion({ usuario, municipioActivo }), reactivada };
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
    jti: payload.jti || null,
    claveId: payload.claveId || null
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

  // El municipio activo debe pertenecer al alcance asignado (el admin puede
  // elegir cualquiera; es su forma de acotarse temporalmente). Si la sesión
  // nació de una clave, también debe estar dentro del territorio de esa clave.
  if (usuario.rol !== 'admin' && usuario.rol !== 'ciudadano') {
    const completo = await repositorio.usuarioPorUsername(usuario.username);
    if (!completo) throw AppError.noAutenticado();
    let ctx = await contextoPersonal(repositorio, completo);
    if (usuario.claveId) {
      const clave = await repositorio.claveAccesoPorId(usuario.claveId);
      if (!clave || !claves.claveVigente(clave)) {
        throw AppError.noAutenticado('Tu clave de acceso ya no es válida');
      }
      await claves.exigirCobertura(repositorio, clave, {
        municipios: ctx.municipios,
        estados: ctx.estados
      });
      ctx = claves.aplicarClaveAUsuario(ctx, clave);
    }

    if (ctx.municipios.length && !ctx.municipios.includes(municipio.id)) {
      throw AppError.prohibido('No tienes acceso a este municipio');
    }
    if (!ctx.municipios.length && ctx.estados.length && !ctx.estados.includes(municipio.estado)) {
      throw AppError.prohibido('No tienes acceso a los municipios de ese estado');
    }

    ctx.municipioId = municipio.id;
    return sesion({
      usuario: ctx,
      municipioActivo: municipio,
      claveId: usuario.claveId || null
    });
  }

  const actualizado = contexto({ ...usuario, municipioId: municipio.id });
  return sesion({
    usuario: actualizado,
    municipioActivo: municipio,
    claveId: usuario.claveId || null
  });
}
