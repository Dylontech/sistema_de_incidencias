/**
 * Cliente SSE de notificaciones en tiempo real.
 *
 * `EventSource` no permite enviar la cabecera `Authorization`, así que se usa
 * `fetch` con lectura incremental del cuerpo. Al recibir un evento se recarga
 * el buzón; el refresco de 60 s se mantiene como red de seguridad.
 */
import { token } from './api.js';
import { recargarNotificaciones } from './aplicacion.js';

let activo = false;
let controlador = null;
let temporizador = null;
let intentos = 0;

const ESPERA_MAXIMA_MS = 30000;

function espera() {
  // 1 s, 2 s, 4 s… hasta 30 s.
  return Math.min(ESPERA_MAXIMA_MS, 1000 * 2 ** Math.min(intentos, 5));
}

function procesarBloque(bloque) {
  let evento = 'mensaje';
  let datos = '';

  for (const linea of bloque.split('\n')) {
    if (linea.startsWith('event:')) evento = linea.slice(6).trim();
    else if (linea.startsWith('data:')) datos += linea.slice(5).trim();
  }

  if (evento === 'notificacion') {
    recargarNotificaciones().catch(() => {
      /* el próximo refresco lo reintenta */
    });
  } else if (evento === 'sesion-cerrada') {
    document.dispatchEvent(new CustomEvent('sesion-expirada'));
  }
}

async function conectar() {
  if (!activo) return;

  const actual = token.leer();
  if (!actual) return;

  controlador = new AbortController();

  try {
    const respuesta = await fetch('/api/eventos', {
      headers: { Authorization: `Bearer ${actual}` },
      signal: controlador.signal,
      cache: 'no-store'
    });

    if (respuesta.status === 401) {
      document.dispatchEvent(new CustomEvent('sesion-expirada'));
      return;
    }
    if (!respuesta.ok || !respuesta.body) {
      throw new Error(`SSE ${respuesta.status}`);
    }

    intentos = 0;
    const lector = respuesta.body.getReader();
    const decodificador = new TextDecoder();
    let buffer = '';

    while (activo) {
      const { value, done } = await lector.read();
      if (done) break;

      buffer += decodificador.decode(value, { stream: true });
      const bloques = buffer.split('\n\n');
      buffer = bloques.pop() || '';
      bloques.forEach(procesarBloque);
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
    /* se reintenta abajo */
  } finally {
    if (controlador) controlador = null;
    if (activo) {
      intentos++;
      clearTimeout(temporizador);
      temporizador = setTimeout(conectar, espera());
    }
  }
}

/** Abre el canal. Idempotente: si ya está activo, no duplica conexiones. */
export function iniciar() {
  if (activo) return;
  activo = true;
  intentos = 0;
  conectar();
}

/** Cierra el canal y cancela cualquier reintento pendiente. */
export function detener() {
  activo = false;
  clearTimeout(temporizador);
  temporizador = null;
  if (controlador) {
    controlador.abort();
    controlador = null;
  }
}

export function estaActivo() {
  return activo;
}
