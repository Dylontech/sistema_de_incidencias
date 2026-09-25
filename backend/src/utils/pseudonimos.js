/**
 * Generador de pseudónimos para las cuentas que no quieren mostrar su nombre.
 *
 * Es la alternativa a «Anónimo» que ofrece el registro: la cuenta tiene
 * identidad (puede recibir avisos y editar sus reportes) pero el vecindario ve
 * un nombre inventado, siempre distinto por el número opcional.
 *
 * `aleatorio` se inyecta en las pruebas para que el resultado sea determinista.
 */

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
