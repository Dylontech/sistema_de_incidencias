/**
 * Generador de pseudónimos para las cuentas que no quieren mostrar su nombre.
 *
 * Es la alternativa a «Anónimo» que ofrece el registro: la cuenta tiene
 * identidad (puede recibir avisos y editar sus reportes) pero el vecindario ve
 * un nombre inventado, siempre distinto por el número opcional.
 *
 * `aleatorio` se inyecta en las pruebas para que el resultado sea determinista.
 */

import { normalizarBusqueda } from './validacion.js';

const SUSTANTIVOS = [
  { nombre: 'Águila', genero: 'f' },
  { nombre: 'Colibrí', genero: 'm' },
  { nombre: 'Jaguar', genero: 'm' },
  { nombre: 'Venado', genero: 'm' },
  { nombre: 'Zorro', genero: 'm' },
  { nombre: 'Coyote', genero: 'm' },
  { nombre: 'Búho', genero: 'm' },
  { nombre: 'Gaviota', genero: 'f' },
  { nombre: 'Mariposa', genero: 'f' },
  { nombre: 'Tortuga', genero: 'f' },
  { nombre: 'Puma', genero: 'm' },
  { nombre: 'Lince', genero: 'm' },
  { nombre: 'Garza', genero: 'f' },
  { nombre: 'Nopal', genero: 'm' },
  { nombre: 'Ahuehuete', genero: 'm' },
  { nombre: 'Majagua', genero: 'f' }
];

const ADJETIVOS = {
  f: ['Nocturna', 'Dorada', 'Veloz', 'Silenciosa', 'Curiosa', 'Valiente', 'Serena', 'Errante', 'Montesa'],
  m: ['Nocturno', 'Dorado', 'Veloz', 'Silencioso', 'Curioso', 'Valiente', 'Sereno', 'Errante', 'Montés']
};

const INDICE = (aleatorio, total) => Math.floor(aleatorio() * total) % total;

/**
 * Devuelve un pseudónimo del tipo «Águila Nocturna» o «Colibrí 07».
 * El número aparece en uno de cada tres casos y sirve para no repetir nombre
 * cuando dos personas eligen el mismo animal.
 */
export function pseudonimoAleatorio(aleatorio = Math.random) {
  const sustantivo = SUSTANTIVOS[INDICE(aleatorio, SUSTANTIVOS.length)];
  const adjetivos = ADJETIVOS[sustantivo.genero];
  const adjetivo = adjetivos[INDICE(aleatorio, adjetivos.length)];
  const numero = INDICE(aleatorio, 3) === 0 ? ` ${String(1 + INDICE(aleatorio, 98)).padStart(2, '0')}` : '';
  return `${sustantivo.nombre} ${adjetivo}${numero}`;
}

/**
 * Pseudónimo libre de colisiones.
 *
 * El nombre (o pseudónimo) es la credencial de acceso del ciudadano, así que no
 * puede haber dos iguales. Sortea combinaciones y descarta las ya usadas sin
 * distinguir mayúsculas ni acentos; si el azar se repite —o el catálogo es
 * pequeño, como en las pruebas— numera el último candidato hasta encontrar uno
 * libre.
 */
export function pseudonimoUnico({ existentes = [], aleatorio = Math.random, intentos = 60 } = {}) {
  const usados = new Set(
    (Array.isArray(existentes) ? existentes : [...existentes])
      .map((nombre) => normalizarBusqueda(nombre))
      .filter(Boolean)
  );

  for (let intento = 0; intento < intentos; intento += 1) {
    const candidato = pseudonimoAleatorio(aleatorio);
    if (!usados.has(normalizarBusqueda(candidato))) return candidato;
  }

  // El azar no encontró hueco: se numera el último candidato.
  const base = pseudonimoAleatorio(aleatorio).replace(/\s+\d{2}$/, '');
  for (let numero = 1; numero <= 999; numero += 1) {
    const candidato = `${base} ${String(numero).padStart(2, '0')}`;
    if (!usados.has(normalizarBusqueda(candidato))) return candidato;
  }

  // Último recurso: sufijo aleatorio para no devolver un nombre repetido.
  return `${base} ${Date.now().toString(36).slice(-4)}`;
}
