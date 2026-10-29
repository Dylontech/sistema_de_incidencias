/** Generación de claves de acceso legibles (sin caracteres ambiguos). */
import crypto from 'node:crypto';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código tipo `MARA-7K3P-9XQ2`. */
export function nuevoCodigoClave() {
  const grupos = [];
  for (let g = 0; g < 3; g++) {
    let grupo = '';
    for (let i = 0; i < 4; i++) grupo += ALFABETO[crypto.randomInt(ALFABETO.length)];
    grupos.push(grupo);
  }
  return grupos.join('-');
}
