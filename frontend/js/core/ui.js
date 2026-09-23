/**
 * Avisos y modales: la capa de feedback de la interfaz.
 * Equivale a toast(), loading() y UI.abrirModal/cerrarModal del monolito.
 */
import { $, $$ } from './utils.js';

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

export function loading(mostrar, texto = 'Procesando…') {
  const overlay = $('loading');
  if (!overlay) return;
  if (mostrar) {
    $('loadingText').textContent = texto;
    overlay.classList.add('show');
  } else {
    overlay.classList.remove('show');
  }
}

/**
 * Abre un modal. Con `nested: true` se muestra ENCIMA del modal actual sin
 * cerrarlo (por ejemplo «Nuevo concepto» o «Resolver» desde el detalle), para
 * no perder lo que el usuario ya había escrito. Mismo criterio que
 * `UI.abrirModal(id, nested)` de la versión nueva del monolito.
 */
export function abrirModal(id, { nested = false } = {}) {
  if (!nested) {
    $$('.modal-overlay.show').forEach((m) => {
      if (m.id !== id) m.classList.remove('show');
    });
  }
  const modal = $(id);
  if (!modal) return;
  modal.classList.toggle('nested', nested);
  modal.classList.add('show');
}

export function cerrarModal(id) {
  const modal = $(id);
  if (modal) modal.classList.remove('show');
}

export function cerrarTodosLosModales() {
  $$('.modal-overlay.show').forEach((m) => m.classList.remove('show'));
}

export function modalAbierto(id) {
  return $(id)?.classList.contains('show') || false;
}

/**
 * Pregunta de confirmación. Se mantiene `window.confirm` por paridad con el
 * monolito; centralizarlo permite sustituirlo por un diálogo propio después.
 */
export function preguntar(mensaje) {
  return window.confirm(mensaje);
}

/** Clic en el fondo del modal y tecla Escape para cerrar. */
export function inicializarModales({ alIntentarCerrar } = {}) {
  document.addEventListener('click', (evento) => {
    const overlay = evento.target.classList?.contains('modal-overlay') ? evento.target : null;
    if (!overlay) return;
    if (alIntentarCerrar && alIntentarCerrar(overlay.id) === false) return;
    overlay.classList.remove('show');
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    cerrarTodosLosModales();
    $('notifPanel')?.classList.remove('show');
  });
}
