/**
 * SERVICIO: cuenta ciudadana.
 *
 * Cubre el ciclo de vida de la cuenta, que es donde está casi todo lo delicado:
 *
 *  - **Confirmar el correo**: mientras no se abra el enlace, la cuenta no sirve
 *    para entrar. Sin esto, cualquiera puede registrarse con la dirección de
 *    otra persona y quedarse con su buzón.
 *  - **Recuperar la contraseña**: el enlace caduca y solo sirve una vez; la
 *    respuesta es siempre la misma, exista o no la cuenta (si no, la propia
 *    pantalla de recuperación sería un buscador de correos registrados).
 *  - **Cambiar la contraseña**: sube la versión de sesión, así que las demás
 *    sesiones abiertas dejan de valer, y se devuelve un token nuevo para no
 *    echar a quien acaba de cambiarla.
 *  - **Descargar los datos** y **darse de baja**: los dos derechos que un vecino
 *    puede ejercer sobre su información.
 */
import { AppError } from '../utils/AppError.js';
import { config } from '../config/index.js';
import { caducidadEn, crearToken, hashDeToken, vigente } from '../utils/tokens.js';
import { enviarRestablecimiento, enviarVerificacion } from './correo.service.js';
import { contextoCiudadano, sesion } from './sesion.service.js';
import {
  hashearPassword,
  limpiarIntentos,
  normalizarCorreo,
  validarPassword,
  verificarPassword,
  versionDeSesion
} from '../models/usuario.model.js';

/** Lo que se enseña en lugar del nombre cuando la cuenta se ha dado de baja. */
const NOMBRE_ANONIMO = 'Anónimo';

/** La cuenta de la sesión, recién leída (el token puede estar desactualizado). */
async function cuentaDeSesion(repositorio, usuario) {
  const cuenta = usuario?.username ? await repositorio.usuarioPorUsername(usuario.username) : null;
  if (!cuenta) throw AppError.noAutenticado('Tu cuenta ya no está disponible');
  return cuenta;
}

/* ------------------------------------------------------------------ correo --- */

/**
 * Emite un token de verificación, guarda su hash y envía el enlace.
 *
 * Devuelve el token en claro (lo usan el registro y las pruebas); nunca se
 * guarda así: en la base solo queda su sha256.
 */
export async function emitirVerificacion(repositorio, cuenta) {
  const token = crearToken();
  await repositorio.actualizarUsuario(cuenta.id, {
    tokenVerificacionHash: hashDeToken(token),
    tokenVerificacionExpira: caducidadEn(config.cuenta.minutosVerificacion)
  });
  await enviarVerificacion(cuenta, token);
  return token;
}

/** Confirmación de la cuenta a partir del enlace del correo. */
export async function verificarCorreo(repositorio, { token } = {}) {
  const valor = String(token || '').trim();
  if (!valor) throw AppError.solicitudInvalida('Falta el código de verificación');

  const cuenta = await repositorio.usuarioPorTokenVerificacion(hashDeToken(valor));
  // Mismo mensaje para «no existe» y «ya se usó»: el token se borra al usarlo,
  // así que un enlace repetido no dice nada nuevo a quien lo encontró.
  if (!cuenta) throw AppError.solicitudInvalida('El enlace no es válido o ya se usó');
  if (!vigente(cuenta.tokenVerificacionExpira)) {
    throw AppError.solicitudInvalida('El enlace ha caducado. Pide que te enviemos otro.');
  }

  if (cuenta.correoVerificado === false) {
    await repositorio.actualizarUsuario(cuenta.id, {
      correoVerificado: true,
      tokenVerificacionHash: null,
      tokenVerificacionExpira: null
    });
  }

  return { correo: cuenta.correo, nombre: cuenta.nombre };
}

/** Reenvía el enlace de confirmación (por si el primero se perdió). */
export async function reenviarVerificacion(repositorio, usuario) {
  const cuenta = await cuentaDeSesion(repositorio, usuario);
  if (cuenta.rol !== 'ciudadano') {
    throw AppError.solicitudInvalida('Esta cuenta no necesita confirmar ningún correo');
  }
  if (cuenta.correoVerificado !== false) {
    return { yaVerificado: true, correo: cuenta.correo };
  }
  await emitirVerificacion(repositorio, cuenta);
  return { yaVerificado: false, correo: cuenta.correo };
}

/**
 * Reenvío desde la pantalla de acceso, cuando todavía no hay sesión.
 *
 * Hace falta porque quien no ha confirmado el correo no puede entrar, así que
 * tampoco tiene sesión con la que pedir el reenvío: sin esta puerta, un enlace
 * perdido dejaría la cuenta inutilizable. La respuesta es siempre la misma,
 * exista o no la cuenta (y aunque ya esté confirmada).
 */
export async function reenviarVerificacionPorCorreo(repositorio, { correo } = {}) {
  const generica = {
    mensaje: 'Si esa dirección tiene una cuenta sin confirmar, te hemos enviado un enlace nuevo.'
  };

  const email = normalizarCorreo(correo);
  if (!email) return generica;

  const cuenta = await repositorio.usuarioPorCorreo(email);
  if (!cuenta || cuenta.rol !== 'ciudadano' || cuenta.activo === false) return generica;
  if (cuenta.correoVerificado !== false) return generica;

  await emitirVerificacion(repositorio, cuenta);
  return generica;
}

/* ------------------------------------------------------------ contraseñas --- */

/**
 * Pide el enlace de recuperación.
 *
 * La respuesta es idéntica exista o no la cuenta, y también cuando el correo
 * llega mal escrito: si cambiara, la pantalla serviría para averiguar qué
 * direcciones están registradas.
 */
export async function solicitarRestablecimiento(repositorio, { correo } = {}) {
  const generica = {
    mensaje:
      'Si esa dirección tiene una cuenta, te hemos enviado un enlace para elegir una contraseña nueva.'
  };

  const email = normalizarCorreo(correo);
  if (!email) return generica;

  const cuenta = await repositorio.usuarioPorCorreo(email);
  if (!cuenta || cuenta.activo === false || cuenta.rol !== 'ciudadano') return generica;

  const token = crearToken();
  await repositorio.actualizarUsuario(cuenta.id, {
    resetTokenHash: hashDeToken(token),
    resetExpira: caducidadEn(config.cuenta.minutosRestablecimiento)
  });
  await enviarRestablecimiento(cuenta, token);

  return generica;
}

/**
 * Elige la contraseña nueva con el enlace del correo.
 *
 * El enlace vale por el correo, así que además de cambiar la contraseña se da
 * el correo por confirmado: quien puede leerlo es quien lo puso al registrarse.
 * Y sirve de salida para quien perdió el enlace de verificación.
 */
export async function restablecerPassword(repositorio, { token, password } = {}) {
  const valor = String(token || '').trim();
  if (!valor) throw AppError.solicitudInvalida('Falta el código de recuperación');

  const cuenta = await repositorio.usuarioPorTokenRestablecimiento(hashDeToken(valor));
  if (!cuenta) throw AppError.solicitudInvalida('El enlace no es válido o ya se usó');
  if (!vigente(cuenta.resetExpira)) {
    throw AppError.solicitudInvalida('El enlace ha caducado. Pide otro desde la pantalla de acceso.');
  }

  validarPassword(password, { correo: cuenta.correo });
  if (await verificarPassword(cuenta, password)) {
    throw AppError.solicitudInvalida('La contraseña nueva tiene que ser distinta de la anterior');
  }

  const actualizada = await repositorio.actualizarUsuario(cuenta.id, {
    passwordHash: await hashearPassword(String(password)),
    // Sube la versión: cualquier sesión abierta con la contraseña anterior (por
    // ejemplo la de quien la robó) deja de servir.
    tokenVersion: versionDeSesion(cuenta) + 1,
    resetTokenHash: null,
    resetExpira: null,
    correoVerificado: true,
    ...limpiarIntentos()
  });

  return sesion({ usuario: contextoCiudadano(actualizada) });
}

/**
 * Cambio de contraseña desde dentro de la sesión (pide la actual).
 * Devuelve una sesión nueva: la versión sube, así que el token con el que se
 * hizo la petición queda invalidado y la pantalla tiene que guardar el nuevo.
 */
export async function cambiarPassword(repositorio, usuario, { actual, nueva } = {}) {
  const cuenta = await cuentaDeSesion(repositorio, usuario);

  if (!(await verificarPassword(cuenta, actual))) {
    throw AppError.solicitudInvalida('La contraseña actual no es correcta');
  }
  validarPassword(nueva, { correo: cuenta.correo });
  if (await verificarPassword(cuenta, nueva)) {
    throw AppError.solicitudInvalida('La contraseña nueva tiene que ser distinta de la actual');
  }

  const actualizada = await repositorio.actualizarUsuario(cuenta.id, {
    passwordHash: await hashearPassword(String(nueva)),
    tokenVersion: versionDeSesion(cuenta) + 1,
    // Un cambio de contraseña deja sin efecto los enlaces pendientes.
    resetTokenHash: null,
    resetExpira: null,
    ...limpiarIntentos()
  });

  return sesion({ usuario: contextoCiudadano(actualizada) });
}

/* ----------------------------------------- derechos sobre los propios datos --- */

/**
 * Todo lo que el sistema guarda de una cuenta (derecho de acceso).
 *
 * Se devuelve tal cual para que el ciudadano pueda descargarlo: sus reportes
 * —también los ocultos por moderación, que siguen siendo suyos—, sus
 * comentarios, los avisos que recibió y las denuncias que presentó.
 */
export async function exportarDatos(repositorio, usuario) {
  const cuenta = await cuentaDeSesion(repositorio, usuario);

  const reportes = await repositorio.buscarIncidencias({
    userKey: cuenta.username,
    ocultas: 'incluir'
  });

  // Los comentarios van dentro del documento del reporte, así que hay que mirar
  // todo el tablón para reunir los suyos (también los de reportes ajenos).
  const incidencias = await repositorio.todasLasIncidencias();
  const comentarios = [];
  for (const incidencia of incidencias) {
    for (const comentario of incidencia.comentarios || []) {
      if (comentario.userKey !== cuenta.username) continue;
      comentarios.push({
        id: comentario.id,
        fecha: comentario.fecha,
        texto: comentario.texto,
        oculto: comentario.oculto === true,
        incidenciaId: incidencia.id,
        incidenciaTitulo: incidencia.titulo
      });
    }
  }

  const avisos = await repositorio.notificacionesDe(cuenta.username);
  const denuncias = await repositorio.denunciasDe({ autorUserKey: cuenta.username });

  return {
    generado: new Date().toISOString(),
    cuenta: {
      username: cuenta.username,
      nombre: cuenta.nombre,
      correo: cuenta.correo,
      municipioId: cuenta.municipioId || null,
      pseudonimo: cuenta.pseudonimo === true,
      correoVerificado: cuenta.correoVerificado !== false
    },
    reportes,
    comentarios,
    avisos,
    denuncias: denuncias.map((d) => ({
      id: d.id,
      fecha: d.fecha,
      objetivo: d.objetivo,
      incidenciaId: d.incidenciaId,
      comentarioId: d.comentarioId || null,
      motivo: d.motivo,
      detalle: d.detalle,
      estado: d.estado,
      resolucion: d.resolucion || ''
    })),
    totales: {
      reportes: reportes.length,
      comentarios: comentarios.length,
      avisos: avisos.length,
      denuncias: denuncias.length
    }
  };
}

/**
 * Baja de la cuenta (derecho de supresión).
 *
 * Los reportes y los comentarios **no se borran**: se anonimizan. El expediente
 * del ayuntamiento (una fuga, un bache) sigue teniendo valor para el servicio,
 * y lo que se pide al darse de baja es dejar de aparecer, no tirar el trabajo.
 * Lo que sí desaparece es lo que solo existía por y para la cuenta: los avisos
 * y las denuncias que presentó, y la cuenta misma.
 *
 * @returns {{reportes:number, comentarios:number, avisos:number, denuncias:number}}
 */
export async function eliminarCuenta(repositorio, usuario, { password } = {}) {
  const cuenta = await cuentaDeSesion(repositorio, usuario);

  if (!(await verificarPassword(cuenta, password))) {
    throw AppError.solicitudInvalida('La contraseña no es correcta');
  }
  if (cuenta.rol !== 'ciudadano') {
    throw AppError.prohibido(
      'Las cuentas del personal no se dan de baja desde aquí: las gestiona un administrador'
    );
  }

  const esMia = (clave) => clave === cuenta.username;
  const limpiarHistorial = (historial) =>
    (historial || []).map((paso) =>
      paso.por === cuenta.nombre ? { ...paso, por: NOMBRE_ANONIMO } : paso
    );
  const incidencias = await repositorio.todasLasIncidencias();
  const totales = { reportes: 0, comentarios: 0, avisos: 0, denuncias: 0 };

  for (const incidencia of incidencias) {
    const propios = (incidencia.comentarios || []).filter((c) => esMia(c.userKey));
    if (!esMia(incidencia.userKey) && !propios.length) continue;

    const comentarios = (incidencia.comentarios || []).map((comentario) =>
      esMia(comentario.userKey)
        ? { ...comentario, autor: NOMBRE_ANONIMO, userKey: null }
        : comentario
    );
    totales.comentarios += propios.length;

    const cambios = { comentarios, historial: limpiarHistorial(incidencia.historial) };

    if (esMia(incidencia.userKey)) {
      // El reporte se queda sin autor: sigue en el mapa y en el listado, pero
      // ya no apunta a ninguna cuenta. `user_key` pasa a 'anonimo' (el valor que
      // usan las sesiones sin cuenta es `anon_<id>`, así que no choca).
      Object.assign(cambios, {
        esAnonimo: true,
        autor: 'anonimo',
        autorNombre: NOMBRE_ANONIMO,
        userKey: 'anonimo'
      });
      totales.reportes++;
    }

    await repositorio.actualizarIncidencia(incidencia.id, { ...incidencia, ...cambios });
  }

  // Denuncias recibidas: el expediente se conserva, pero sin el nombre de quien
  // la cuenta señalaba (los moderadores ven "Anónimo").
  for (const denuncia of await repositorio.denunciasDe({ objetivoUserKey: cuenta.username })) {
    await repositorio.actualizarDenuncia(denuncia.id, {
      ...denuncia,
      objetivoAutor: NOMBRE_ANONIMO,
      objetivoUserKey: null
    });
  }

  // Denuncias presentadas: eran de la cuenta, así que se van con ella.
  for (const denuncia of await repositorio.denunciasDe({ autorUserKey: cuenta.username })) {
    await repositorio.eliminarDenuncia(denuncia.id);
    totales.denuncias++;
  }

  for (const aviso of await repositorio.notificacionesDe(cuenta.username)) {
    await repositorio.eliminarNotificacion(aviso.id);
    totales.avisos++;
  }

  await repositorio.eliminarUsuario(cuenta.id);
  return totales;
}
