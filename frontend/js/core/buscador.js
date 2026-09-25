/**
 * Buscador de municipios con sugerencias (combobox).
 *
 * Un `<select>` con el catálogo completo del INEGI (175 municipios de tres
 * estados) obliga a desplazarse a ciegas. Este buscador deja escribir y muestra
 * las coincidencias por nombre o por estado, sin distinguir mayúsculas ni
 * acentos (escribir «morelia» o «michoacan» encuentra lo mismo).
 *
 * El `<select>` original se conserva **oculto como fuente de verdad**: su
 * `value` y su evento `change` los sigue usando la aplicación, y aquí solo se
 * mantiene sincronizado. Así ninguna pieza existente tiene que cambiar.
 *
 * Módulo del navegador: exporta `crearBuscador()`.
 */
import { $, esc } from './utils.js';

/** Cuántas sugerencias se pintan como máximo. */
const MAX_SUGERENCIAS = 40;

/** Minúsculas y sin acentos, para comparar lo que se escribe. */
export function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Convierte un campo de texto en buscador del catálogo de municipios.
 *
 * @param {Object} opciones
 * @param {string} opciones.entrada id del `<input>` de búsqueda
 * @param {string} opciones.lista   id del `<ul>` de sugerencias
 * @param {string} [opciones.fuente] id del `<select>` oculto que guarda el valor
 * @returns {Object|null} control con `cargar`, `sincronizar` y `bloquear`
 */
export function crearBuscador({ entrada, lista, fuente = null } = {}) {
  const input = $(entrada);
  const panel = $(lista);
  const select = fuente ? $(fuente) : null;
  if (!input || !panel) return null;

  /** Catálogo completo (el que se filtra). */
  let municipios = [];
  /** Coincidencias visibles ahora mismo. */
  let visibles = [];
  /** Índice resaltado con las flechas del teclado (-1 = ninguno). */
  let activo = -1;
  /** Motivo por el que el campo está bloqueado (funcionario), si lo hay. */
  let motivoBloqueo = '';

  const abierto = () => !panel.hidden;

  function cerrar() {
    panel.hidden = true;
    panel.innerHTML = '';
    visibles = [];
    activo = -1;
    input.setAttribute('aria-expanded', 'false');
    // Cerrar sin elegir (Escape o un clic fuera) no puede dejar en el campo un
    // texto a medias: se vuelve a mostrar el municipio activo de verdad.
    sincronizar();
  }

  function pintar() {
    if (!visibles.length) {
      panel.innerHTML = '<li class="combo-vacio">Sin coincidencias en el catálogo</li>';
      return;
    }

    panel.innerHTML = visibles
      .map(
        (m, i) => `
        <li class="combo-opcion${i === activo ? ' activo' : ''}" role="option" data-id="${esc(m.id)}"
            id="${esc(lista)}-${i}" aria-selected="${i === activo}">
          <span class="combo-nombre">${esc(m.nombre)}</span>
          <span class="combo-estado">${esc(m.estado || '')}</span>
        </li>`
      )
      .join('');

    // Si el teclado movió la selección, se deja a la vista.
    panel.querySelector('.activo')?.scrollIntoView({ block: 'nearest' });
  }

  /** Filtra el catálogo por lo escrito y abre la lista. */
  function filtrar() {
    const consulta = normalizarTexto(input.value);
    const encontrados = consulta
      ? municipios.filter((m) => normalizarTexto(`${m.nombre} ${m.estado}`).includes(consulta))
      : municipios.slice();

    // Los que empiezan por lo escrito van primero; luego, orden alfabético.
    visibles = encontrados
      .sort((a, b) => {
        const ia = normalizarTexto(a.nombre).startsWith(consulta) ? 0 : 1;
        const ib = normalizarTexto(b.nombre).startsWith(consulta) ? 0 : 1;
        return ia - ib || a.nombre.localeCompare(b.nombre, 'es');
      })
      .slice(0, MAX_SUGERENCIAS);

    activo = -1;
    pintar();
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  /** Fija el municipio elegido (y avisa a quien escucha el `<select>`). */
  function elegir(municipio) {
    if (!municipio) return;
    if (select) {
      select.value = municipio.id;
      // Misma vía que antes: el `change` del selector oculto dispara la acción.
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    cerrar();
    sincronizar();
  }

  /** Copia al campo de texto lo que diga el selector oculto. */
  function sincronizar() {
    const elegido = municipios.find((m) => m.id === (select ? select.value : null)) || null;
    input.value = elegido ? elegido.nombre : '';
    input.title =
      motivoBloqueo ||
      (elegido ? (elegido.estado ? `${elegido.nombre}, ${elegido.estado}` : elegido.nombre) : '');
  }

  function mover(paso) {
    if (!abierto() || !visibles.length) return;
    activo = (activo + paso + visibles.length) % visibles.length;
    pintar();
  }

  input.addEventListener('focus', () => {
    if (municipios.length && !abierto()) filtrar();
  });

  input.addEventListener('input', () => {
    if (!input.disabled) filtrar();
  });

  input.addEventListener('keydown', (evento) => {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      if (abierto()) mover(1);
      else filtrar();
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      mover(-1);
    } else if (evento.key === 'Enter') {
      if (abierto() && activo >= 0) {
        evento.preventDefault();
        elegir(visibles[activo]);
      }
    } else if (evento.key === 'Escape') {
      cerrar();
    }
  });

  panel.addEventListener('click', (evento) => {
    const opcion = evento.target.closest('.combo-opcion');
    if (!opcion) return;
    elegir(municipios.find((m) => m.id === opcion.dataset.id) || null);
  });

  // Un clic fuera cierra la lista sin cambiar nada.
  document.addEventListener('click', (evento) => {
    if (!abierto()) return;
    if (evento.target === input || panel.contains(evento.target)) return;
    cerrar();
  });

  return {
    /** Guarda el catálogo y refleja en el campo el valor actual del selector. */
    cargar(lista = []) {
      municipios = lista;
      sincronizar();
    },
    sincronizar,
    /** Bloquea el campo (un funcionario no puede cambiar de municipio). */
    bloquear(valor, motivo = '') {
      const bloqueado = valor === true;
      input.disabled = bloqueado;
      motivoBloqueo = bloqueado ? motivo : '';
      if (bloqueado) cerrar();
      else sincronizar();
    },
    cerrar
  };
}
