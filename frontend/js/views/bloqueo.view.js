/**
 * Pantalla de bloqueo por suspensión de moderación.
 *
 * Cubre la aplicación entera: si la cuenta está suspendida no se entra ni como
 * ciudadano anónimo (se muestra esta capa y no se arranca la interfaz). El
 * único camino que deja es cerrar sesión.
 */
import { $ } from '../core/utils.js';

export function mostrar(mensaje) {
  const capa = $('bloqueoScreen');
  if (!capa) return;
  const texto = $('bloqueoMensaje');
  if (texto) texto.textContent = mensaje || 'Tu cuenta está suspendida por moderación.';
  capa.hidden = false;
}

export function ocultar() {
  const capa = $('bloqueoScreen');
  if (capa) capa.hidden = true;
}

export function visible() {
  return $('bloqueoScreen')?.hidden === false;
}
