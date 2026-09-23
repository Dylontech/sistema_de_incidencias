/** Vista del modal de detalle de una incidencia. */
import { $, esc, fmtFecha, colorHex, etiquetaEstado, textoAntiguedad } from '../core/utils.js';

function evidenciaHTML(evidencia, { abrirImagen = true } = {}) {
  const esImagen = evidencia.tipo?.startsWith('image/');
  const esVideo = evidencia.tipo?.startsWith('video/');
  return `
    <div class="evidence-item">
      ${
        esImagen
          ? `<img src="${esc(evidencia.url)}" alt="${esc(evidencia.nombre)}"${abrirImagen ? ' data-action="detalle:verImagen" data-id="' + esc(evidencia.url) + '" style="cursor:pointer;"' : ''}>`
          : esVideo
            ? `<video src="${esc(evidencia.url)}" controls muted preload="metadata"></video>`
            : `<div class="ev-file"><i class="bi bi-file-earmark-fill"></i></div>`
      }
      <div class="ev-name" title="${esc(evidencia.nombre)}">${esc(evidencia.nombre)}</div>
    </div>`;
}

/** Pinta el detalle completo (equivale a UI.abrirDetalle). */
export function renderizar(incidencia, { tipos = [], zonas = [], usuario } = {}) {
  const contenedor = $('detalleBody');
  if (!contenedor) return;

  const tipo = tipos.find((t) => t.id === incidencia.tipoId);
  const zona = zonas.find((z) => z.id === incidencia.zonaId);
  const esResuelta = incidencia.estado === 'resuelta';
  const permisos = incidencia.permisos || {};

  const estadoBadge = {
    reportada: `<span class="inc-badge badge-${incidencia.color}">Reportada</span>`,
    en_proceso: '<span class="inc-badge" style="background:#d1ecf1;color:#0c5460;">En proceso</span>',
    resuelta: '<span class="inc-badge badge-verde">Resuelta</span>'
  }[incidencia.estado] || '';

  let html = `
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;">
      <span style="font-size:2.5rem;line-height:1;">${incidencia.iconoCustom || (tipo ? tipo.icono : '❗')}</span>
      <div style="flex:1;min-width:0;">
        <h3 style="font-size:1.15rem;margin-bottom:4px;">${esc(incidencia.titulo)}</h3>
        <div style="font-size:12px;color:#718096;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <span>${esc(tipo ? tipo.nombre : '—')}</span>
          ${estadoBadge}
          ${!esResuelta ? `<span style="color:#94a3b8;">${textoAntiguedad(incidencia.dias)} activa</span>` : ''}
        </div>
      </div>
    </div>

    <div class="detail-row">
      <div class="label">Descripción</div>
      <div class="value">${esc(incidencia.descripcion)}</div>
    </div>
    ${
      incidencia.indicaciones
        ? `<div class="detail-row">
             <div class="label">Indicaciones</div>
             <div class="value">${esc(incidencia.indicaciones)}</div>
           </div>`
        : ''
    }
    <div class="detail-row">
      <div class="label">Ubicación</div>
      <div class="value">
        ${Number(incidencia.lat).toFixed(6)}, ${Number(incidencia.lng).toFixed(6)}
        <button class="btn btn-sm btn-outline" style="margin-left:8px;" data-action="detalle:verMapa"
          data-id="${incidencia.id}" data-valor="${incidencia.lat},${incidencia.lng}">
          <i class="bi bi-crosshair"></i> Ver en mapa
        </button>
      </div>
    </div>
    ${
      incidencia.zonaNombre
        ? `<div class="detail-row">
             <div class="label">Zona</div>
             <div class="value">
               <span style="background:${zona ? zona.color : '#6c757d'};color:#fff;padding:2px 10px;border-radius:12px;font-size:11.5px;font-weight:700;">
                 ${esc(incidencia.zonaNombre)}
               </span>
             </div>
           </div>`
        : ''
    }
    <div class="detail-row">
      <div class="label">Reportó</div>
      <div class="value">${esc(incidencia.esAnonimo ? 'Anónimo' : incidencia.autorNombre)}</div>
    </div>
    <div class="detail-row">
      <div class="label">Fecha</div>
      <div class="value">${fmtFecha(incidencia.fecha)}</div>
    </div>
  `;

  if (incidencia.evidencia?.length) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title"><i class="bi bi-images"></i> Evidencia del reporte</div>
        <div class="evidence-list">${incidencia.evidencia.map((e) => evidenciaHTML(e)).join('')}</div>
      </div>`;
  }

  if (esResuelta) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title" style="color:var(--verde);">
          <i class="bi bi-check-circle-fill"></i> Solución aplicada
        </div>
        <div style="background:#d4edda;border:1px solid #c3e6cb;border-radius:8px;padding:12px;font-size:13px;">
          <div style="font-weight:600;color:#155724;margin-bottom:4px;">
            Resuelta el ${fmtFecha(incidencia.fechaResolucion)}
          </div>
          <div style="color:#1a202c;">${esc(incidencia.solucion || 'Sin descripción')}</div>
        </div>
        ${
          incidencia.evidenciaSolucion?.length
            ? `<div class="evidence-list" style="margin-top:10px;">
                 ${incidencia.evidenciaSolucion.map((e) => evidenciaHTML(e)).join('')}
               </div>`
            : ''
        }
      </div>`;
  }

  if (incidencia.historial?.length) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title"><i class="bi bi-clock-history"></i> Historial</div>
        <div class="status-timeline">
          ${incidencia.historial
            .slice()
            .reverse()
            .map(
              (h) => `
            <div class="timeline-item">
              <div class="t-dot"></div>
              <div style="flex:1;">
                <div style="font-weight:600;color:#1a202c;">${esc(h.accion)}</div>
                <div class="t-time">${fmtFecha(h.fecha)} · ${esc(h.por || '—')}</div>
              </div>
            </div>`
            )
            .join('')}
        </div>
      </div>`;
  }

  const comentarios = incidencia.comentarios || [];
  html += `
    <div class="detail-section">
      <div class="detail-section-title"><i class="bi bi-chat-dots-fill"></i> Comentarios (${comentarios.length})</div>
      <div class="comment-list" id="commentList">
        ${
          comentarios.length
            ? comentarios
                .map(
                  (c) => `
              <div class="comment-item">
                <div class="c-meta">
                  <span class="c-author">${esc(c.autor)}</span>
                  <span>${fmtFecha(c.fecha)}</span>
                </div>
                <div class="c-text">${esc(c.texto)}</div>
              </div>`
                )
                .join('')
            : '<div style="color:#94a3b8;font-size:12px;padding:10px;text-align:center;">Sin comentarios todavía</div>'
        }
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <input type="text" id="nuevoComentario" placeholder="Escribe un comentario…" maxlength="500"
          style="flex:1;padding:8px 12px;border:1px solid #cbd5e0;border-radius:8px;font-size:12.5px;">
        <button class="btn btn-primary btn-sm" data-action="detalle:comentar" data-id="${esc(incidencia.id)}">
          <i class="bi bi-send-fill"></i>
        </button>
      </div>
    </div>
  `;

  const acciones = [];
  if (permisos.puedeEditar) {
    acciones.push(`<button class="btn btn-outline" data-action="incidencias:editar" data-id="${esc(incidencia.id)}">
      <i class="bi bi-pencil-fill"></i> Editar
    </button>`);
  }
  if (permisos.puedeCambiarEstado && incidencia.estado === 'reportada') {
    acciones.push(`<button class="btn btn-warning" data-action="detalle:estado" data-id="${esc(incidencia.id)}" data-valor="en_proceso">
      <i class="bi bi-arrow-repeat"></i> Marcar en proceso
    </button>`);
  }
  if (permisos.puedeResolver) {
    acciones.push(`<button class="btn btn-success" data-action="detalle:resolver" data-id="${esc(incidencia.id)}">
      <i class="bi bi-check-circle-fill"></i> Marcar resuelta
    </button>`);
  }
  if (permisos.puedeEliminar) {
    acciones.push(`<button class="btn btn-danger" data-action="detalle:eliminar" data-id="${esc(incidencia.id)}">
      <i class="bi bi-trash3-fill"></i> Eliminar
    </button>`);
  }

  if (acciones.length) {
    html += `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px;padding-top:16px;border-top:1px solid var(--borde);">
      ${acciones.join('')}
    </div>`;
  }

  contenedor.innerHTML = html;
}

export function valorComentario() {
  return $('nuevoComentario')?.value.trim() || '';
}

export function limpiarComentario() {
  const campo = $('nuevoComentario');
  if (campo) campo.value = '';
}
