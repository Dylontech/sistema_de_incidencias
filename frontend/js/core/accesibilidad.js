/**
 * Preferencias de accesibilidad del dispositivo.
 *
 * El tamaño del texto se guarda en `localStorage` y se aplica con
 * `data-texto` en `<html>`. Los estilos viven en `css/extensiones.css`; aquí
 * no se escribe ningún `style` inline.
 */
import { registrarAcciones } from './eventos.js';

export const CLAVE_ACCESIBILIDAD = 'inc_accesibilidad_v1';
export const NIVELES_TEXTO = ['normal', 'grande', 'muy-grande'];

export function normalizarNivel(nivel) {
  return NIVELES_TEXTO.includes(nivel) ? nivel : 'normal';
}

export function siguienteNivel(nivel) {
  const actual = NIVELES_TEXTO.indexOf(normalizarNivel(nivel));
  return NIVELES_TEXTO[Math.min(actual + 1, NIVELES_TEXTO.length - 1)];
}

export function anteriorNivel(nivel) {
  const actual = NIVELES_TEXTO.indexOf(normalizarNivel(nivel));
  return NIVELES_TEXTO[Math.max(actual - 1, 0)];
}

export function leerNivel() {
  try {
    return normalizarNivel(JSON.parse(localStorage.getItem(CLAVE_ACCESIBILIDAD) || 'null')?.nivel);
  } catch {
    return 'normal';
  }
}

function guardarNivel(nivel) {
  try {
    localStorage.setItem(CLAVE_ACCESIBILIDAD, JSON.stringify({ nivel }));
  } catch {
    // Almacenamiento no disponible: la preferencia dura la sesión actual.
  }
}

function actualizarBotones(nivel) {
  document.querySelectorAll('[data-action^="accesibilidad:texto"]').forEach((boton) => {
    const accion = boton.dataset.action;
    const esMenos = accion === 'accesibilidad:textoMenos';
    const esMas = accion === 'accesibilidad:textoMas';
    const esNormal = accion === 'accesibilidad:textoRestablecer';
    boton.disabled =
      (esMenos && nivel === 'normal') ||
      (esMas && nivel === 'muy-grande') ||
      (esNormal && nivel === 'normal');
    const activo =
      (esNormal && nivel === 'normal') ||
      (esMenos && nivel === 'grande') ||
      (esMas && nivel === 'muy-grande');
    boton.setAttribute('aria-pressed', String(activo));
  });
}

export function aplicarNivel(nivel, { persistir = true } = {}) {
  const elegido = normalizarNivel(nivel);
  document.documentElement.dataset.texto = elegido;
  actualizarBotones(elegido);
  if (persistir) guardarNivel(elegido);
  return elegido;
}

export function aumentarTexto() {
  return aplicarNivel(siguienteNivel(document.documentElement.dataset.texto));
}

export function disminuirTexto() {
  return aplicarNivel(anteriorNivel(document.documentElement.dataset.texto));
}

export function restablecerTexto() {
  return aplicarNivel('normal');
}

/** Aplica la preferencia guardada y registra los botones de la barra lateral. */
export function inicializar() {
  aplicarNivel(leerNivel(), { persistir: false });
  registrarAcciones({
    'accesibilidad:textoMenos': () => {
      disminuirTexto();
    },
    'accesibilidad:textoMas': () => {
      aumentarTexto();
    },
    'accesibilidad:textoRestablecer': () => {
      restablecerTexto();
    }
  });
}
