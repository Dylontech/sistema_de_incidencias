/**
 * Avisos y modales: la capa de feedback de la interfaz.
 * Equivale a toast(), loading() y UI.abrirModal/cerrarModal del monolito.
 *
 * Los modales llevan `role="dialog"`, `aria-modal`, foco inicial, trampa de
 * tabulación y devolución del foco al elemento que los abrió.
 */
import { $, $$ } from './utils.js';
import { confirmar } from './dialogos.js';

export function toast(mensaje, tipo = 'ok') {
  const elemento = $('toast');
  if (!elemento) return;
  elemento.textContent = mensaje;
  elemento.className = `toast ${tipo} show`;
  clearTimeout(elemento._temporizador);
  elemento._temporizador = setTimeout(() => {
    elemento.className = `toast ${tipo}`;
  }, 4000);
}

/** Texto de la carga que quedó pendiente mientras el splash estaba visible. */
let cargaPendiente = null;

/**
 * Muestra u oculta el overlay de carga.
 *
 * Mientras el splash de arranque siga visible, NO se abre el overlay: ambos
 * tienen su propio spinner y superponerlos hacía que se vieran dos espirales.
 * En ese caso solo se actualiza el texto del splash; cuando el splash se retira,
 * `retirarArranque()` pasa la carga pendiente al overlay.
 */
export function loading(mostrar, texto = 'Procesando…') {
  const overlay = $('loading');
  if (!overlay) return;
  const boot = $('bootScreen');
  const enArranque = Boolean(boot && !boot.hidden);

  if (mostrar) {
    if (enArranque) {
      cargaPendiente = texto;
      const textoBoot = boot.querySelector('.boot-card p');
      if (textoBoot) textoBoot.textContent = texto;
      return;
    }
    cargaPendiente = null;
    $('loadingText').textContent = texto;
    overlay.classList.add('show');
  } else if (!enArranque) {
    cargaPendiente = null;
    overlay.classList.remove('show');
  }
}

/**
 * Retira el splash de arranque. Si había una carga en curso (por ejemplo,
 * «Restaurando sesión…»), la traspasa al overlay para no dejar la interfaz
 * sin indicador ni mostrar dos spinners a la vez.
 */
export function retirarArranque() {
  const boot = $('bootScreen');
  if (boot) boot.hidden = true;
  if (!cargaPendiente) return;
  const texto = cargaPendiente;
  cargaPendiente = null;
  const overlay = $('loading');
  if (!overlay) return;
  $('loadingText').textContent = texto;
  overlay.classList.add('show');
}

/** Elemento que tenía el foco antes de abrir el primer modal. */
let focoAnterior = null;

function modalesVisibles() {
  return $$('.modal-overlay.show');
}

function modalSuperior() {
  const visibles = modalesVisibles();
  return visibles.length ? visibles[visibles.length - 1] : null;
}

function enfocables(contenedor) {
  return [...contenedor.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((elemento) => elemento.offsetParent !== null);
}

function prepararModal(modal, id) {
  if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const titulo = modal.querySelector('.modal-head h3');
  if (titulo && !modal.hasAttribute('aria-labelledby')) {
    if (!titulo.id) titulo.id = `titulo-${id}`;
    modal.setAttribute('aria-labelledby', titulo.id);
  }
}

/**
 * Abre un modal. Con `nested: true` se muestra ENCIMA del modal actual sin
 * cerrarlo (por ejemplo «Nuevo concepto» o «Resolver» desde el detalle), para
 * no perder lo que el usuario ya había escrito.
 */
export function abrirModal(id, { nested = false } = {}) {
  const visibles = modalesVisibles();
  if (!nested) {
    visibles.forEach((m) => {
      if (m.id !== id) m.classList.remove('show');
    });
  }
  const modal = $(id);
  if (!modal) return;

  if (!modalesVisibles().length) focoAnterior = document.activeElement;

  modal.classList.toggle('nested', nested);
  prepararModal(modal, id);
  modal.classList.add('show');

  const destino = enfocables(modal)[0] || modal;
  if (destino === modal) modal.setAttribute('tabindex', '-1');
  // Se espera al siguiente tick para que el navegador aplique la visibilidad.
  window.setTimeout(() => destino.focus({ preventScroll: true }), 0);
}

export function cerrarModal(id) {
  const modal = $(id);
  if (modal) modal.classList.remove('show');

  if (!modalesVisibles().length && focoAnterior instanceof HTMLElement) {
    focoAnterior.focus({ preventScroll: true });
    focoAnterior = null;
  }
}

export function cerrarTodosLosModales() {
  modalesVisibles().forEach((m) => m.classList.remove('show'));
  if (focoAnterior instanceof HTMLElement) {
    focoAnterior.focus({ preventScroll: true });
    focoAnterior = null;
  }
}

export function modalAbierto(id) {
  return $(id)?.classList.contains('show') || false;
}

/**
 * Pregunta de confirmación con el diálogo propio de la aplicación.
 * Devuelve una promesa: hay que esperarla (`if (!(await preguntar(…)))`).
 */
export function preguntar(mensaje, opciones = {}) {
  return confirmar({ mensaje, ...opciones });
}

/** Clic en el fondo del modal, Escape y trampa de tabulación. */
export function inicializarModales({ alIntentarCerrar } = {}) {
  document.addEventListener('click', (evento) => {
    const overlay = evento.target.classList?.contains('modal-overlay') ? evento.target : null;
    if (!overlay) return;
    if (alIntentarCerrar && alIntentarCerrar(overlay.id) === false) return;
    cerrarModal(overlay.id);
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      // Solo se cierra el modal de arriba: los anidados no se llevan por delante.
      const superior = modalSuperior();
      if (superior) {
        cerrarModal(superior.id);
        return;
      }
      $('notifPanel')?.classList.remove('show');
      return;
    }

    if (evento.key !== 'Tab') return;
    const superior = modalSuperior();
    if (!superior) return;

    const lista = enfocables(superior);
    if (!lista.length) {
      evento.preventDefault();
      return;
    }
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    const activo = document.activeElement;

    if (evento.shiftKey && (activo === primero || !superior.contains(activo))) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && (activo === ultimo || !superior.contains(activo))) {
      evento.preventDefault();
      primero.focus();
    }
  });
}
