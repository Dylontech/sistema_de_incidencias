/**
 * SERVICIO: construcción de la sesión (token firmado + contexto del usuario).
 *
 * Vive aparte de `auth.service` porque también lo necesitan las operaciones de
 * cuenta: al cambiar la contraseña hay que devolver un token nuevo para que el
 * ciudadano no se quede fuera de la sesión que acaba de usar. Así la
 * dependencia va en un solo sentido (auth → cuenta → sesión) y no hay ciclos.
 *
 * El token lleva la **versión de la sesión** (`v`). Al cambiar la contraseña esa
 * versión sube, de modo que todos los tokens emitidos antes dejan de valer sin
 * necesidad de guardar la lista de sesiones abiertas.
 */
import { firmarToken } from '../utils/jwt.js';
import { versionDeSesion } from '../models/usuario.model.js';

/** Contexto que se inyecta en `req.usuario` y viaja dentro del token. */
export function contexto({
  username,
  nombre,
  rol,
  municipioId,
  userKey,
  correo = null,
  version = 1,
  correoVerificado = undefined
}) {
  return {
    username,
    nombre,
    rol,
    municipioId: municipioId || null,
    correo: correo || null,
    userKey,
    version: Number(version) || 1,
    ...(correoVerificado === undefined ? {} : { correoVerificado: correoVerificado !== false })
  };
}

/**
 * Contexto de una cuenta ciudadana guardada.
 *
 * El `username` de estas cuentas es opaco y aleatorio, y a la vez sirve de
 * `userKey`: los reportes públicos apuntan a él, así que no puede contener ni el
 * correo ni el nombre real.
 */
export function contextoCiudadano(usuario) {
  return contexto({
    username: usuario.username,
    nombre: usuario.nombre,
    rol: 'ciudadano',
    municipioId: usuario.municipioId,
    correo: usuario.correo,
    userKey: usuario.username,
    version: versionDeSesion(usuario),
    correoVerificado: usuario.correoVerificado !== false
  });
}

/** Respuesta de una entrada correcta: token, datos públicos y municipio. */
export function sesion({ usuario, municipioActivo = null }) {
  return {
    token: firmarToken({
      sub: usuario.username,
      username: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
      municipioId: usuario.municipioId || null,
      correo: usuario.correo || null,
      userKey: usuario.userKey,
      v: Number(usuario.version) || 1
    }),
    usuario: {
      username: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
      municipioId: usuario.municipioId || null,
      correo: usuario.correo || null,
      userKey: usuario.userKey,
      esAnonimo: usuario.rol === 'anonimo',
      ...(usuario.correoVerificado === undefined
        ? {}
        : { correoVerificado: usuario.correoVerificado !== false })
    },
    municipioActivo
  };
}
