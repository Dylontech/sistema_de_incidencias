/** Huella de IP: nunca se guarda la dirección en claro. */
import crypto from 'node:crypto';
import { config } from '../config/index.js';

export function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(`${config.jwt.secret}:${ip}`).digest('hex').slice(0, 32);
}
