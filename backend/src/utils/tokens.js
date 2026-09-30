/**
 * Tokens de un solo uso: verificación del correo y recuperación de contraseña.
 *
 * El token viaja en el enlace del correo; en la base solo se guarda su **hash
 * sha256**. Así, una copia de la tabla no sirve para entrar en ninguna cuenta,
 * y el token original no se puede reconstruir desde el servidor.
 */
import { createHash, randomBytes } from 'node:crypto';

/** Token nuevo: 32 bytes aleatorios en base64url (sin caracteres problemáticos). */
export function crearToken() {
  return randomBytes(32).toString('base64url');
}

/** Huella que se guarda en la base de datos. */
export function hashDeToken(token) {
  return createHash('sha256').update(String(token ?? '')).digest('hex');
}

/** Fecha ISO en la que caduca un token emitido ahora mismo. */
export function caducidadEn(minutos) {
  return new Date(Date.now() + Number(minutos) * 60_000).toISOString();
}

/** ¿Sigue vigente? Sin fecha se considera caducado (nunca se emitió). */
export function vigente(hasta, ahora = new Date()) {
  if (!hasta) return false;
  return new Date(hasta).getTime() > ahora.getTime();
}

/** Texto humano del plazo, para los mensajes («24 horas», «1 hora»). */
export function plazoLegible(minutos) {
  const total = Number(minutos) || 0;
  if (total < 60) return `${total} minutos`;
  const horas = Math.round(total / 60);
  return horas === 1 ? '1 hora' : `${horas} horas`;
}
