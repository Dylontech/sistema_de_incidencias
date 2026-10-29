/**
 * Utilidades de DOM y formato.
 * Portadas del monolito ($, esc, fmtFecha…) más los helpers que aparecieron
 * al separar la vista del controlador.
 */

export const $ = (id) => document.getElementById(id);

export const $$ = (selector, raiz = document) => Array.from(raiz.querySelectorAll(selector));

/** Escapa texto para insertarlo en HTML (evita XSS en las plantillas). */
export function esc(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escapa un valor para usarlo dentro de un atributo entre comillas simples. */
export function escAttr(valor) {
  return esc(valor).replace(/'/g, '&#39;');
}

export function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function fmtFechaCorta(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/** «Hoy», «Ayer» o «Hace N días» (como en la lista del monolito). */
export function textoDias(dias) {
  if (dias === null || dias === undefined) return '—';
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  return `Hace ${dias} días`;
}

export function textoAntiguedad(dias) {
  if (dias === null || dias === undefined) return '—';
  return `${dias} día${dias === 1 ? '' : 's'}`;
}

export const COLOR_HEX = {
  verde: '#28a745',
  amarillo: '#ffc107',
  naranja: '#fd7e14',
  rojo: '#dc3545'
};

export function colorHex(color) {
  return COLOR_HEX[color] || '#6c757d';
}

export function etiquetaEstado(estado) {
  const etiquetas = {
    reportada: 'Reportada',
    en_proceso: 'En proceso',
    resuelta: 'Resuelta'
  };
  return etiquetas[estado] || estado;
}

export function formatoBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Descarga un texto como archivo (paridad con `Reportes.descargar`). */
export function descargar(contenido, nombre, mime) {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function debounce(fn, ms = 250) {
  let temporizador = null;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), ms);
  };
}

/** Fecha de hoy en formato AAAA-MM-DD para los nombres de archivo. */
export function hoyIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Aplica a un fragmento recién pintado los valores que dependen de los datos y
 * por eso no pueden ser una clase: el color de una zona del catálogo (un hex
 * arbitrario) o el ancho de una barra de progreso.
 *
 * Se hace por CSSOM (`elemento.style.x = …`), que la Content-Security-Policy SÍ
 * permite: lo que prohíbe es declarar el estilo dentro del propio marcado.
 * Por eso el HTML usa `data-fondo` / `data-texto` / `data-ancho` y esta función
 * los traduce después de insertarlo.
 */
export function aplicarEstilosDinamicos(raiz = document) {
  raiz.querySelectorAll('[data-fondo]').forEach((el) => {
    el.style.background = el.dataset.fondo;
  });
  raiz.querySelectorAll('[data-texto]').forEach((el) => {
    el.style.color = el.dataset.texto;
  });
  raiz.querySelectorAll('[data-ancho]').forEach((el) => {
    el.style.width = el.dataset.ancho;
  });
}
