/** Firma y verificación de los tokens JWT. */
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function firmarToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

/** Devuelve el payload o null si el token es inválido/expirado. */
export function verificarToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch {
    return null;
  }
}
