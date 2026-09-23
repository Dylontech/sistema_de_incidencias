/** Vista del panel de notificaciones y su contador. */
import { $, esc, fmtFecha } from '../core/utils.js';

const ICONOS = {
  reporte: '✅',
  resuelta: '🎉',
  estado: '🔄',
  alerta: '⚠️',
  comentario: '💬'
};

export function renderizarBadge(notificaciones = []) {
  const badge = $('notif-badge');
  if (!badge) return;
  const sinLeer = notificaciones.filter((n) => !n.leida).length;
  if (sinLeer > 0) {
    badge.textContent = sinLeer > 99 ? '99+' : String(sinLeer);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

export function renderizarPanel(notificaciones = []) {
  const contenedor = $('notifList');
  if (!contenedor) return;

  if (!notificaciones.length) {
    contenedor.innerHTML =
      '<div class="notif-empty"><i class="bi bi-bell-slash" style="font-size:2rem;display:block;margin-bottom:8px;"></i>Sin notificaciones</div>';
    return;
  }

  contenedor.innerHTML = notificaciones
    .map(
      (n) => `
    <div class="notif-item ${n.leida ? '' : 'unread'}">
      <div class="n-icon">${ICONOS[n.tipo] || '🔔'}</div>
      <div class="n-content" data-action="notificaciones:leer" data-id="${esc(n.id)}" style="cursor:pointer;">
        <div class="n-title">${esc(n.titulo)}</div>
        <div class="n-msg">${esc(n.mensaje)}</div>
        <div class="n-time">${fmtFecha(n.fecha)}</div>
      </div>
      <button class="modal-close" style="font-size:1rem;padding:0 4px;"
        data-action="notificaciones:eliminar" data-id="${esc(n.id)}">&times;</button>
    </div>`
    )
    .join('');
}

export function alternarPanel(abrir) {
  const panel = $('notifPanel');
  if (!panel) return false;
  const visible = abrir === undefined ? panel.classList.toggle('show') : panel.classList.toggle('show', abrir);
  return visible;
}

export function panelVisible() {
  return $('notifPanel')?.classList.contains('show') || false;
}
