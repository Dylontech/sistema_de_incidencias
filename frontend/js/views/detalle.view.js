/** Vista del modal de detalle de una incidencia. */
import { $, esc, fmtFecha, etiquetaEstado, textoAntiguedad, aplicarEstilosDinamicos } from '../core/utils.js';

function evidenciaHTML(evidencia, { abrirImagen = true } = {}) {
  const esImagen = evidencia.tipo?.startsWith('image/');
  // Ya no se suben videos, pero los reportes antiguos que los tengan se siguen viendo.
  const esVideo = evidencia.tipo?.startsWith('video/');
  return `
    <div class="evidence-item">
      ${
        esImagen
          ? `<img src="${esc(evidencia.url)}" alt="${esc(evidencia.nombre)}"${abrirImagen ? ' class="u-cursor" data-action="detalle:verImagen" data-id="' + esc(evidencia.url) + '"' : ''}>`
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
    en_proceso: '<span class="inc-badge estado-proceso">En proceso</span>',
    resuelta: '<span class="inc-badge badge-verde">Resuelta</span>'
  }[incidencia.estado] || '';

  let html = `
    ${
      incidencia.oculta
        ? `<div class="detalle-oculta">
             <i class="bi bi-eye-slash-fill icono-14rem"></i>
             <div>
               <strong>PUBLICACIÓN OCULTA POR MODERACIÓN</strong>
               ${incidencia.ocultaMotivo ? ` · ${esc(incidencia.ocultaMotivo)}` : ''}
               <div class="u-fs-115px">
                 Retirada por ${esc(incidencia.ocultaPor || 'el personal')}${
                   incidencia.ocultaFecha ? ` el ${fmtFecha(incidencia.ocultaFecha)}` : ''
                 }. ${
                   permisos.puedeOcultar
                     ? 'Solo el personal y su autor pueden verla.'
                     : 'Solo tú y el personal pueden verla.'
                 }
               </div>
             </div>
           </div>`
        : ''
    }
    ${
      permisos.denunciasPendientes
        ? `<div class="detalle-denuncias">
             <i class="bi bi-flag-fill"></i>
             <span><strong>${permisos.denunciasPendientes}</strong> ${
               permisos.denunciasPendientes === 1 ? 'denuncia pendiente' : 'denuncias pendientes'
             } de moderar</span>
           </div>`
        : ''
    }
    ${
      incidencia.peligrosa
        ? `<div class="detalle-peligro">
             <i class="bi bi-exclamation-triangle-fill icono-14rem"></i>
             <div>
               <strong>INCIDENCIA PELIGROSA</strong>
               ${incidencia.peligrosaMotivo ? ` · ${esc(incidencia.peligrosaMotivo)}` : ''}
               <div class="u-fs-115px">
                 Marcada por ${esc(incidencia.peligrosaPor || 'el personal')}${
                   incidencia.peligrosaFecha ? ` el ${fmtFecha(incidencia.peligrosaFecha)}` : ''
                 }
               </div>
             </div>
           </div>`
        : ''
    }
    ${
      tipo?.aviso
        ? `<div class="aviso-tipo">
             <i class="bi bi-exclamation-triangle-fill"></i>
             <span>${esc(tipo.aviso)}</span>
           </div>`
        : ''
    }
    <div class="fila-detalle">
      <span class="icono-25rem">${incidencia.iconoCustom || (tipo ? tipo.icono : '❗')}</span>
      <div class="u-flex-1 u-min-0">
        <h3 class="titulo-incidencia">${esc(incidencia.titulo)}</h3>
        <div class="meta-fila">
          <span>${esc(tipo ? tipo.nombre : '—')}</span>
          ${estadoBadge}
          ${!esResuelta ? `<span class="u-suave">${textoAntiguedad(incidencia.dias)} activa</span>` : ''}
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
        <button class="btn btn-sm btn-outline u-ml-8" data-action="detalle:verMapa"
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
               <span class="chip-zona chip-zona-lg" data-fondo="${esc(zona ? zona.color : '#6c757d')}">
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
        <div class="detail-section-title u-verde">
          <i class="bi bi-check-circle-fill"></i> Solución aplicada
        </div>
        <div class="caja-resuelto">
          <div class="u-peso-600 u-verde-exito u-mb-4">
            Resuelta el ${fmtFecha(incidencia.fechaResolucion)}
          </div>
          <div class="u-tinta">${esc(incidencia.solucion || 'Sin descripción')}</div>
        </div>
        ${
          incidencia.evidenciaSolucion?.length
            ? `<div class="evidence-list u-mt-10">
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
              <div class="u-flex-1">
                <div class="u-peso-600 u-tinta">${esc(h.accion)}</div>
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
                .map((c) => {
                  // El texto de un comentario moderado no llega al cliente salvo
                  // al personal y a su autor (`visible: false`).
                  const retirado = c.visible === false;
                  const propio = usuario?.userKey && c.userKey === usuario.userKey;
                  const acciones = [
                    permisos.puedeDenunciar && !propio
                      ? `<button class="c-accion" data-action="denuncia:abrir" data-id="${esc(incidencia.id)}" data-valor="${esc(c.id)}"><i class="bi bi-flag"></i> Denunciar</button>`
                      : '',
                    permisos.puedeOcultar
                      ? c.oculto
                        ? `<button class="c-accion" data-action="moderacion:comentario" data-id="${esc(incidencia.id)}:${esc(c.id)}" data-valor="mostrar"><i class="bi bi-eye"></i> Mostrar</button>`
                        : `<button class="c-accion" data-action="moderacion:comentario" data-id="${esc(incidencia.id)}:${esc(c.id)}" data-valor="ocultar"><i class="bi bi-eye-slash"></i> Ocultar</button>`
                      : ''
                  ]
                    .filter(Boolean)
                    .join('');
                  return `
              <div class="comment-item${c.oculto ? ' oculto' : ''}">
                <div class="c-meta">
                  <span class="c-author">${esc(c.autor)}</span>
                  <span>${fmtFecha(c.fecha)}</span>
                  ${c.oculto ? '<span class="chip-aviso naranja">Oculto por moderación</span>' : ''}
                </div>
                ${
                  retirado
                    ? '<div class="c-text c-retirado"><i class="bi bi-eye-slash-fill"></i> Comentario retirado por moderación</div>'
                    : `<div class="c-text">${esc(c.texto)}</div>`
                }
                ${acciones ? `<div class="c-acciones">${acciones}</div>` : ''}
              </div>`;
                })
                .join('')
            : '<div class="vacio-suave u-p-10 u-centro">Sin comentarios todavía</div>'
        }
      </div>
      ${
        incidencia.oculta
          ? '<div class="campo-nota"><i class="bi bi-info-circle"></i> Una publicación oculta por moderación no admite comentarios nuevos.</div>'
          : `<div class="u-fila-simple u-mt-10">
        <input class="campo-linea u-flex-1" type="text" id="nuevoComentario" placeholder="Escribe un comentario…" maxlength="500">
        <button class="btn btn-primary btn-sm" data-action="detalle:comentar" data-id="${esc(incidencia.id)}">
          <i class="bi bi-send-fill"></i>
        </button>
      </div>`
      }
    </div>
  `;

  const acciones = [];
  if (permisos.puedeDenunciar) {
    acciones.push(`<button class="btn btn-outline" data-action="denuncia:abrir" data-id="${esc(incidencia.id)}">
      <i class="bi bi-flag-fill"></i> Denunciar
    </button>`);
  }
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
  if (permisos.puedeMarcarPeligro) {
    acciones.push(
      incidencia.peligrosa
        ? `<button class="btn btn-outline" data-action="detalle:peligro" data-id="${esc(incidencia.id)}" data-valor="quitar">
             <i class="bi bi-shield-check"></i> Quitar peligro
           </button>`
        : `<button class="btn btn-danger" data-action="detalle:peligro" data-id="${esc(incidencia.id)}" data-valor="marcar">
             <i class="bi bi-exclamation-triangle-fill"></i> Marcar peligrosa
           </button>`
    );
  }
  if (permisos.puedeEliminar) {
    acciones.push(`<button class="btn btn-danger" data-action="detalle:eliminar" data-id="${esc(incidencia.id)}">
      <i class="bi bi-trash3-fill"></i> Eliminar
    </button>`);
  }
  if (permisos.puedeOcultar) {
    acciones.push(
      incidencia.oculta
        ? `<button class="btn btn-success" data-action="moderacion:ocultar" data-id="${esc(incidencia.id)}" data-valor="mostrar">
             <i class="bi bi-eye-fill"></i> Volver a mostrar
           </button>`
        : `<button class="btn btn-danger" data-action="moderacion:ocultar" data-id="${esc(incidencia.id)}" data-valor="ocultar">
             <i class="bi bi-eye-slash-fill"></i> Ocultar
           </button>`
    );
  }
  if (permisos.puedeSancionarAutor) {
    acciones.push(`<button class="btn btn-warning" data-action="moderacion:advertir" data-id="${esc(incidencia.id)}">
      <i class="bi bi-exclamation-triangle-fill"></i> Advertir al autor
    </button>`);
    acciones.push(`<button class="btn btn-danger" data-action="moderacion:suspender" data-id="${esc(incidencia.autor)}">
      <i class="bi bi-slash-circle-fill"></i> Suspender cuenta
    </button>`);
  }

  if (acciones.length) {
    html += `<div class="pie-modal">
      ${acciones.join('')}
    </div>`;
  }

  contenedor.innerHTML = html;
  // El color de la comunidad es un hex del catálogo: se aplica por CSSOM.
  aplicarEstilosDinamicos(contenedor);
}

export function valorComentario() {
  return $('nuevoComentario')?.value.trim() || '';
}

export function limpiarComentario() {
  const campo = $('nuevoComentario');
  if (campo) campo.value = '';
}
