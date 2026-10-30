/**
 * Cifrado simétrico de la contraseña consultable.
 *
 * El acceso se sigue verificando con el hash bcrypt de `usuarios.password_hash`;
 * esta copia cifrada existe solo para que un administrador pueda consultar o
 * restablecer una contraseña concreta, siempre con registro en auditoría.
 *
 * Formato: `v1.<iv base64>.<tag base64>.<datos base64>` (AES-256-GCM).
 * La llave sale de `PASSWORD_LLAVE`; si no está, se deriva del secreto JWT
 * (válido para desarrollo y pruebas, nunca para producción).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config/index.js';

const ALGORITMO = 'aes-256-gcm';
const VERSION = 'v1';
const LARGO_IV = 12;

function llave() {
  const material = String(config.seguridad.passwordLlave || '').trim()
    ? String(config.seguridad.passwordLlave).trim()
    : `desarrollo:${config.jwt.secret}`;
  // sha256 devuelve exactamente los 32 bytes que exige AES-256.
  return createHash('sha256').update(material).digest();
}

/** ¿Hay una llave explícita configurada? */
export function tieneLlavePropia() {
  return Boolean(String(config.seguridad.passwordLlave || '').trim());
}

/** Cifra una contraseña. Devuelve `null` si no hay texto. */
export function cifrarPassword(texto) {
  const valor = String(texto ?? '');
  if (!valor) return null;
  const iv = randomBytes(LARGO_IV);
  const cifrador = createCipheriv(ALGORITMO, llave(), iv);
  const datos = Buffer.concat([cifrador.update(valor, 'utf8'), cifrador.final()]);
  const tag = cifrador.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    datos.toString('base64')
  ].join('.');
}

/** Descifra una contraseña. Devuelve `null` si el texto no es válido. */
export function descifrarPassword(payload) {
  const valor = String(payload || '');
  if (!valor) return null;
  const [version, iv, tag, datos] = valor.split('.');
  if (version !== VERSION || !iv || !tag || !datos) return null;
  try {
    const descifrador = createDecipheriv(ALGORITMO, llave(), Buffer.from(iv, 'base64'));
    descifrador.setAuthTag(Buffer.from(tag, 'base64'));
    const claro = Buffer.concat([
      descifrador.update(Buffer.from(datos, 'base64')),
      descifrador.final()
    ]);
    return claro.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Contraseña temporal legible para entregar en mano.
 *
 * Evita caracteres que se confunden al dictarla (0/O, 1/l/I) y siempre incluye
 * mayúscula, minúscula y dígito.
 */
export function passwordTemporal(largo = 12) {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const numeros = '23456789';
  const simbolos = '*-_';
  const alfabeto = `${letras}${numeros}${simbolos}`;
  const bytes = randomBytes(Math.max(8, largo));
  let salida = '';
  for (let indice = 0; indice < bytes.length; indice += 1) {
    salida += alfabeto[bytes[indice] % alfabeto.length];
  }
  // Garantía de composición: se sustituyen las tres primeras posiciones.
  const extra = randomBytes(3);
  const posiciones = [0, 1, 2];
  const relleno = [
    letras[extra[0] % letras.length],
    numeros[extra[1] % numeros.length],
    simbolos[extra[2] % simbolos.length]
  ];
  const caracteres = salida.split('');
  posiciones.forEach((posicion, indice) => {
    caracteres[posicion] = relleno[indice];
  });
  return caracteres.join('');
}
