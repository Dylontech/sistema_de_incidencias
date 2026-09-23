/** Selector de iconos (compartido por el formulario de incidencia y el panel). */
import { $, esc } from '../core/utils.js';

export function renderIconPickers(iconos = []) {
  const html = iconos
    .map(
      (emoji) => `
      <div class="icon-opt" data-emoji="${esc(emoji)}" data-action="tipos:icono" data-id="__PICKER__">
        <span class="emoji">${emoji}</span>
      </div>`
    )
    .join('');

  ['iconPicker', 'iconPickerNuevo'].forEach((id) => {
    const contenedor = $(id);
    if (contenedor) contenedor.innerHTML = html.replaceAll('__PICKER__', id);
  });
}

export function seleccionarIcono(pickerId, emoji, elemento) {
  const contenedor = $(pickerId);
  if (!contenedor) return;
  contenedor.querySelectorAll('.icon-opt').forEach((opcion) => opcion.classList.remove('selected'));
  if (elemento) {
    elemento.classList.add('selected');
  } else {
    contenedor.querySelector(`.icon-opt[data-emoji="${CSS.escape(emoji)}"]`)?.classList.add('selected');
  }
  contenedor.dataset.selected = emoji;
}

export function iconoSeleccionado(pickerId) {
  return $(pickerId)?.dataset.selected || '';
}

export function limpiarPicker(pickerId) {
  const contenedor = $(pickerId);
  if (!contenedor) return;
  contenedor.querySelectorAll('.icon-opt').forEach((o) => o.classList.remove('selected'));
  contenedor.dataset.selected = '';
}

/** Tabla de tipos del panel de administración. */
export function renderListaTipos(tipos = [], { puedeEliminar } = {}) {
  const contenedor = $('tiposLista');
  if (!contenedor) return;

  contenedor.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Icono</th><th>Nombre</th><th>ID</th><th>Acciones</th></tr></thead>
      <tbody>
        ${tipos
          .map(
            (tipo) => `
          <tr>
            <td style="font-size:1.5rem;">${tipo.icono}</td>
            <td><strong>${esc(tipo.nombre)}</strong>${
              tipo.custom ? ' <span style="font-size:10px;color:#006657;">(personalizado)</span>' : ''
            }</td>
            <td><code style="font-size:10.5px;">${esc(tipo.id)}</code></td>
            <td>${
              tipo.custom && puedeEliminar
                ? `<button class="btn btn-sm btn-danger" data-action="tipos:eliminar" data-id="${esc(tipo.id)}">
                     <i class="bi bi-trash3"></i>
                   </button>`
                : '<span style="font-size:11px;color:#94a3b8;">Predefinido</span>'
            }</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}
