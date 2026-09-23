/**
 * Delegación de eventos.
 *
 * El monolito usaba 44 atributos `onclick` que llamaban a objetos globales;
 * eso es incompatible con módulos ES. Ahora cada elemento declara qué acción
 * dispara con `data-action` y los controladores registran su manejador.
 *
 *   <button data-action="incidencias:guardar" data-id="...">
 *   <select data-change="lista:filtrar">
 *   <input data-input="admin:buscar">
 *   <form data-submit="auth:entrarFuncionario">
 */

const acciones = new Map();

/** Registra o sustituye acciones: { 'dominio:accion': (ctx) => … }. */
export function registrarAcciones(mapa) {
  Object.entries(mapa).forEach(([nombre, manejador]) => acciones.set(nombre, manejador));
}

export function accionRegistrada(nombre) {
  return acciones.has(nombre);
}

function ejecutar(nombre, evento, elemento) {
  const manejador = acciones.get(nombre);
  if (!manejador) {
    console.warn('[eventos] acción sin manejador:', nombre);
    return;
  }
  const contexto = {
    evento,
    elemento,
    id: elemento.dataset.id || null,
    valor: elemento.dataset.valor || null
  };
  const resultado = manejador(contexto);
  // Si el manejador devuelve una promesa, los fallos no deben perderse.
  if (resultado?.catch) {
    resultado.catch((e) => console.error(`[eventos] error en ${nombre}`, e));
  }
  return resultado;
}

export function conectarDelegacion(raiz = document) {
  raiz.addEventListener('click', (evento) => {
    const elemento = evento.target.closest?.('[data-action]');
    if (!elemento || elemento.disabled) return;
    if (elemento.tagName === 'BUTTON' && elemento.type === 'button') evento.preventDefault();
    ejecutar(elemento.dataset.action, evento, elemento);
  });

  raiz.addEventListener('change', (evento) => {
    const elemento = evento.target.closest?.('[data-change]');
    if (elemento) ejecutar(elemento.dataset.change, evento, elemento);
  });

  raiz.addEventListener('input', (evento) => {
    const elemento = evento.target.closest?.('[data-input]');
    if (elemento) ejecutar(elemento.dataset.input, evento, elemento);
  });

  raiz.addEventListener('submit', (evento) => {
    const elemento = evento.target.closest?.('[data-submit]');
    if (!elemento) return;
    evento.preventDefault();
    ejecutar(elemento.dataset.submit, evento, elemento);
  });
}
