/**
 * Visor interno de adjuntos (imagen o PDF).
 *
 * Lo usan la bandeja de mensajes y los comentarios de incidencias para
 * previsualizar dentro de `#modalVisorAdjunto` en lugar de abrir una pestaña
 * nueva con el token de la sesión en la URL.
 */
import { $, esc } from './utils.js';
import { abrirModal } from './ui.js';

export function verAdjunto({ url, tipo = '', nombre = 'Archivo adjunto' } = {}) {
  if (!url) return;
  const cuerpo = $('visorAdjuntoCuerpo');
  const enlace = $('visorAdjuntoDescargar');
  if ($('visorAdjuntoNombre')) $('visorAdjuntoNombre').textContent = nombre;
  if (enlace) enlace.href = url;
  if (cuerpo) {
    if (String(tipo).startsWith('image/')) {
      cuerpo.innerHTML = `<img class="visor-adjunto-imagen" src="${esc(url)}" alt="${esc(nombre)}">`;
    } else if (String(tipo) === 'application/pdf') {
      cuerpo.innerHTML = `<iframe class="visor-adjunto-frame" src="${esc(url)}" title="${esc(nombre)}"></iframe>`;
    } else {
      cuerpo.innerHTML =
        '<p class="campo-nota">Este tipo de documento no se puede previsualizar en el navegador. Ábrelo en otra pestaña para verlo o descargarlo.</p>';
    }
  }
  abrirModal('modalVisorAdjunto', { nested: true });
}
