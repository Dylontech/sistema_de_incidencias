/** Vista del modal de detalle de una incidencia. */
import { $, esc, fmtFecha, textoAntiguedad, formatoBytes, aplicarEstilosDinamicos } from '../core/utils.js';
import { urlPrivada } from '../core/api.js';
import { esPersonal } from '../core/roles.js';

const ETIQUETAS_AMBITO = {
  urbano: 'Zona urbana o municipal',
  carretera_estatal: 'Carretera estatal',
  carretera_federal: 'Carretera federal',
  autopista: 'Autopista',
  camino_rural: 'Camino rural',
  otro: 'Otra vialidad'
};

const MIMES_IMAGEN_COMENTARIO = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Imagen elegida para el próximo comentario; sobrevive a los repintados. */
let adjuntoComentarioSeleccionado = null;
/** Id del adjunto ya subido, para reintentar sin volver a subir la imagen. */
let adjuntoComentarioId = null;
let esperaComentarioSegundos = 0;
/** Bloqueo por restricción, cuota o solo lectura (no por cuenta atrás). */
let comentarioBloqueadoPorEstado = false;

function mensajeDeEspera(segundos) {
  return `Podrás comentar de nuevo en ${segundos} s.`;
}

/** Pinta la miniatura y los datos del archivo elegido (o la oculta). */
function pintarAdjuntoComentario() {
  const caja = $('comentarioAdjuntoPreview');
  if (!caja) return;
  const hay = Boolean(adjuntoComentarioSeleccionado);
  caja.hidden = !hay;
  caja.classList.toggle('u-oculto', !hay);
  if (!hay) {
    caja.innerHTML = '';
    return;
  }
  const { archivo, url } = adjuntoComentarioSeleccionado;
  caja.innerHTML = `
    <img src="${esc(url)}" alt="${esc(archivo.name)}">
    <div class="c-adjunto-datos">
      <strong title="${esc(archivo.name)}">${esc(archivo.name)}</strong>
      <span class="campo-nota">${esc(formatoBytes(archivo.size))} · se enviará con el mensaje</span>
    </div>
    <button type="button" class="btn btn-outline btn-sm" data-action="detalle:quitarAdjunto">
      <i class="bi bi-x-lg"></i> Quitar
    </button>`;
}

/** Registra la imagen elegida y muestra su vista previa. */
export function seleccionarAdjuntoComentario(archivo) {
  if (!archivo) return;
  if (adjuntoComentarioSeleccionado?.url) {
    URL.revokeObjectURL(adjuntoComentarioSeleccionado.url);
  }
  // Si cambia la imagen, el adjunto anterior deja de servir para el reintento.
  adjuntoComentarioId = null;
  adjuntoComentarioSeleccionado = { archivo, url: URL.createObjectURL(archivo) };
  pintarAdjuntoComentario();
}

/** Descarta la imagen elegida y limpia el input de archivo. */
export function quitarAdjuntoComentario() {
  if (adjuntoComentarioSeleccionado?.url) {
    URL.revokeObjectURL(adjuntoComentarioSeleccionado.url);
  }
  adjuntoComentarioSeleccionado = null;
  adjuntoComentarioId = null;
  const entrada = $('nuevoComentarioArchivo');
  if (entrada) entrada.value = '';
  pintarAdjuntoComentario();
}

/** Indica si el archivo elegido pasa el filtro de tipo y tamaño (5 MB). */
export function archivoComentarioValido(archivo) {
  if (!archivo) return true;
  if (archivo.type && !MIMES_IMAGEN_COMENTARIO.includes(archivo.type)) return false;
  return Number(archivo.size) <= 5 * 1024 * 1024;
}

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

function firmasHTML(incidencia, firmas, usuario) {
  if (!firmas) {
    return `
      <div class="detail-section">
        <div class="detail-section-title"><i class="bi bi-pen-fill"></i> Firmas ciudadanas</div>
        <p class="campo-nota">No se pudo cargar el resumen de firmas.</p>
      </div>`;
  }
  const total = Number(firmas.total) || 0;
  const meta = Number(firmas.meta) || 0;
  const porcentaje = meta > 0 ? Math.min(Math.round((total / meta) * 100), 100) : 0;
  const firmantes = Array.isArray(firmas.firmantes) ? firmas.firmantes : [];
  const anonimo = usuario?.rol === 'anonimo';
  return `
    <div class="detail-section firmas-panel">
      <div class="detail-section-title">
        <i class="bi bi-pen-fill"></i> Firmas ciudadanas
        <span class="chip-aviso">${total}${meta ? ` / ${meta}` : ''}</span>
      </div>
      <p class="campo-nota u-mb-8">
        Firmar respalda el reporte. Una cuenta puede firmar una sola vez por incidencia y hasta
        ${esc(String(firmas.maximoPorUsuario || 10))} incidencias en total.
      </p>
      ${
        meta
          ? `<div class="firmas-progreso-caja">
               <div class="firmas-progreso-texto">${porcentaje}% de la meta</div>
               <progress class="firmas-progreso" value="${total}" max="${meta}">${porcentaje}%</progress>
             </div>`
          : '<p class="campo-nota">Todavía no se fijó una meta de firmas.</p>'
      }
      <div class="u-fila-sep u-mt-10">
        ${
          firmas.firmada
            ? `<span class="chip-aviso verde"><i class="bi bi-check2-circle"></i> Ya firmaste</span>
               <button class="btn btn-outline btn-sm" data-action="firmas:retirar" data-id="${esc(incidencia.id)}">
                 <i class="bi bi-x-circle"></i> Retirar mi firma
               </button>`
            : firmas.puedeFirmar
              ? `<button class="btn btn-primary btn-sm" data-action="firmas:firmar" data-id="${esc(incidencia.id)}">
                   <i class="bi bi-pen"></i> Firmar esta incidencia
                 </button>`
              : anonimo
                ? `<button class="btn btn-primary btn-sm" data-action="auth:mostrarLogin" data-valor="registro">
                     <i class="bi bi-person-plus-fill"></i> Crea tu cuenta para firmar
                   </button>`
                : '<span class="campo-nota">No puedes firmar esta incidencia en este momento.</span>'
        }
        ${
          firmas.id
            ? `<button class="btn btn-outline btn-sm" data-action="firmas:exportar" data-id="${esc(firmas.id)}" data-valor="csv">
                 <i class="bi bi-filetype-csv"></i> CSV
               </button>
               <button class="btn btn-outline btn-sm" data-action="firmas:exportar" data-id="${esc(firmas.id)}" data-valor="pdf">
                 <i class="bi bi-filetype-pdf"></i> PDF
               </button>`
            : ''
        }
        ${
          firmas.esAutor && firmas.id
            ? `<button class="btn btn-outline btn-sm" data-action="firmas:solicitar" data-id="${esc(firmas.id)}">
                 <i class="bi bi-send"></i> Solicitar al admin
               </button>`
            : ''
        }
      </div>
      ${
        firmas.puedeEditarMeta
          ? `<div class="u-fila-simple u-mt-10">
               <label class="campo-nota" for="firmasMetaInput">Meta de firmas</label>
               <input type="number" id="firmasMetaInput" class="campo-linea" min="1" max="10000" autocomplete="off" value="${meta || 100}">
               <button class="btn btn-outline btn-sm" data-action="firmas:meta" data-id="${esc(incidencia.id)}">
                 <i class="bi bi-check2"></i> Guardar meta
               </button>
             </div>`
          : ''
      }
      ${
        firmantes.length
          ? `<details class="firmas-lista">
               <summary>Ver firmantes (${firmantes.length})</summary>
               <ul>
                 ${firmantes
                   .slice(0, 100)
                   .map((f) => `<li>${esc(f.nombre || 'Ciudadano')} <span class="campo-nota">${fmtFecha(f.creadoEn)}</span></li>`)
                   .join('')}
               </ul>
             </details>`
          : ''
      }
    </div>`;
}

/** Pinta el detalle completo (equivale a UI.abrirDetalle). */
export function renderizar(incidencia, { tipos = [], zonas = [], usuario, firmas = null } = {}) {
  const contenedor = $('detalleBody');
  if (!contenedor) return;

  const tipo = tipos.find((t) => t.id === incidencia.tipoId);
  const zona = zonas.find((z) => z.id === incidencia.zonaId);
  const esResuelta = incidencia.estado === 'resuelta';
  const permisos = incidencia.permisos || {};
  const estadoComentario = permisos.comentario || null;
  const comentarioBloqueado = Boolean(estadoComentario && estadoComentario.puede === false);
  // La espera se reinicia en cada pintado: el controlador programa la cuenta
  // atrás si el servidor acaba de indicar que aún no se puede comentar.
  esperaComentarioSegundos =
    comentarioBloqueado && estadoComentario.codigo === 'espera'
      ? Math.max(0, Number(estadoComentario.esperaSegundos) || 0)
      : 0;
  comentarioBloqueadoPorEstado = Boolean(
    comentarioBloqueado && estadoComentario.codigo !== 'espera'
  );

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
    ${
      incidencia.ambito && incidencia.ambito !== 'urbano'
        ? `<div class="detail-row">
             <div class="label">Vialidad</div>
             <div class="value">
               <strong>${esc(ETIQUETAS_AMBITO[incidencia.ambito] || incidencia.ambito)}</strong>
               ${incidencia.viaNombre ? ` · ${esc(incidencia.viaNombre)}` : ''}
               ${incidencia.viaClave ? ` · ${esc(incidencia.viaClave)}` : ''}
               ${incidencia.kilometro != null ? ` · km ${esc(String(incidencia.kilometro))}` : ''}
               ${incidencia.sentido ? `<div class="campo-nota">Sentido: ${esc(incidencia.sentido)}</div>` : ''}
               ${incidencia.tramo ? `<div class="campo-nota">Tramo: ${esc(incidencia.tramo)}</div>` : ''}
               ${incidencia.dependencia ? `<div class="campo-nota">Dependencia: ${esc(incidencia.dependencia)}</div>` : ''}
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

  if (incidencia.reparacionEstado && incidencia.reparacionEstado !== 'sin_asignar') {
    const docsReparacion = Array.isArray(incidencia.documentosReparacion)
      ? incidencia.documentosReparacion
      : [];
    const etiquetas = {
      asignada: 'Asignada',
      en_reparacion: 'En reparación',
      terminada: 'Terminada, pendiente de validación',
      validada: 'Validada por coordinación'
    };
    html += `
      <div class="detail-section">
        <div class="detail-section-title"><i class="bi bi-tools"></i> Reparación de campo</div>
        <div class="detail-row"><div class="label">Estado</div><div class="value">${esc(
          etiquetas[incidencia.reparacionEstado] || incidencia.reparacionEstado
        )}</div></div>
        <div class="detail-row"><div class="label">Cuadrilla</div><div class="value">${esc(
          incidencia.asignadaNombre || 'Sin asignar'
        )}</div></div>
        ${
          incidencia.reparacionNotas
            ? `<p class="campo-nota u-mt-6">${esc(incidencia.reparacionNotas)}</p>`
            : ''
        }
        ${
          docsReparacion.length
            ? `<div class="evidence-list u-mt-8">${docsReparacion
                .map((documento) => evidenciaHTML(documento))
                .join('')}</div>`
            : '<p class="campo-nota u-mt-6">Sin documentos oficiales de la reparación.</p>'
        }
      </div>`;
  }

  if (esResuelta) {
    const documentos = incidencia.documentosResolucion || incidencia.evidenciaSolucion || [];
    const desglose = Array.isArray(incidencia.desgloseCostos) ? incidencia.desgloseCostos : [];
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
          <div class="campo-nota u-mt-6">
            <strong>Costo de reparación:</strong> ${
              incidencia.costoReparacion === null || incidencia.costoReparacion === undefined
                ? 'No registrado'
                : Number(incidencia.costoReparacion).toLocaleString('es-MX', {
                    style: 'currency',
                    currency: 'MXN'
                  })
            }
          </div>
          ${
            desglose.length
              ? `<div class="u-scroll-x u-mt-8"><table class="data-table">
                  <thead><tr><th>Concepto</th><th>Monto</th><th>Nota</th></tr></thead>
                  <tbody>${desglose
                    .map(
                      (item) => `<tr><td>${esc(item.concepto)}</td><td>${Number(
                        item.monto || 0
                      ).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</td><td>${esc(
                        item.nota || '—'
                      )}</td></tr>`
                    )
                    .join('')}</tbody>
                </table></div>`
              : ''
          }
        </div>
        ${
          documentos.length
            ? `<div class="evidence-list u-mt-10">${documentos.map((e) => evidenciaHTML(e)).join('')}</div>`
            : ''
        }
        ${
          incidencia.archivada
            ? '<p class="campo-nota u-mt-6"><i class="bi bi-archive"></i> Esta incidencia está en el archivo (pasó un día desde la resolución).</p>'
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

  html += firmasHTML(incidencia, firmas, usuario);

  const comentarios = incidencia.comentarios || [];
  html += `
    <div class="detail-section">
      <div class="detail-section-title"><i class="bi bi-chat-dots-fill"></i> Comentarios (${comentarios.length})</div>
      <p class="campo-nota u-mb-8">
        Normas: sé respetuoso, no publiques datos personales ni spam. Los comentarios pueden
        moderarse y las cuentas con abuso pueden quedar restringidas.
      </p>
      <div class="comment-list" id="commentList">
        ${
          comentarios.length
            ? comentarios
                .map((c) => {
                  // El texto de un comentario moderado no llega al cliente salvo
                  // al personal y a su autor (`visible: false`).
                  const retirado = c.visible === false;
                  const imagenes = (c.adjuntos || []).filter(
                    (a) =>
                      a?.url &&
                      (String(a.tipo || '').startsWith('image/') ||
                        /\.(png|jpe?g|webp|gif)$/i.test(String(a.nombre || '')))
                  );
                  const propio = usuario?.userKey && c.userKey === usuario.userKey;
                  const acciones = [
                    (propio || permisos.puedeOcultar) && !c.eliminadoEn
                      ? `<button class="c-accion" data-action="detalle:borrarComentario" data-id="${esc(incidencia.id)}" data-valor="${esc(c.id)}"><i class="bi bi-trash3"></i> Borrar</button>`
                      : '',
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
                ${!retirado && imagenes.length ? `<div class="c-adjuntos">${imagenes.map((a) => `<button type="button" class="c-adjunto" data-action="detalle:verAdjunto" data-url="${esc(urlPrivada(a.url))}" data-tipo="${esc(a.tipo || '')}" data-nombre="${esc(a.nombre || 'Imagen adjunta')}" title="Ver ${esc(a.nombre || 'imagen adjunta')}"><img src="${esc(urlPrivada(a.url))}" alt="${esc(a.nombre || 'Imagen adjunta')}" decoding="async"></button>`).join('')}</div>` : ''}
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
          : usuario?.rol === 'anonimo'
            ? '<div class="campo-nota"><i class="bi bi-person-plus"></i> Crea una cuenta o inicia sesión para comentar en este reporte.</div>'
            : `<form class="comentario-form u-mt-10" data-submit="detalle:comentar" data-id="${esc(incidencia.id)}">
        <div class="c-adjunto-preview u-oculto" id="comentarioAdjuntoPreview" hidden></div>
        <div class="comentario-fila">
          <input class="campo-linea" type="text" id="nuevoComentario" placeholder="Escribe un comentario…" maxlength="500" autocomplete="off">
          <label class="btn btn-outline btn-sm c-adjuntar" for="nuevoComentarioArchivo" title="Adjuntar imagen (máx. 5 MB)">
            <i class="bi bi-image"></i> Imagen
            <input type="file" id="nuevoComentarioArchivo" class="u-oculto" accept="image/png,image/jpeg,image/webp,image/gif" data-change="detalle:archivoComentario">
          </label>
          <button type="submit" class="btn btn-primary btn-sm" id="nuevoComentarioEnviar"${comentarioBloqueado ? ' disabled' : ''}>
            <i class="bi bi-send-fill"></i> Comentar
          </button>
        </div>
        <p class="campo-nota comentario-espera${comentarioBloqueado ? '' : ' u-oculto'}" id="comentarioEspera"${comentarioBloqueado ? '' : ' hidden'}>${esc(estadoComentario?.motivo || '')}</p>
      </form>`
      }
    </div>
  `;

  const acciones = [];
  if (usuario && esPersonal(usuario)) {
    acciones.push(`<button class="btn btn-outline" data-action="detalle:pdf" data-id="${esc(incidencia.id)}">
      <i class="bi bi-filetype-pdf"></i> Descargar PDF
    </button>`);
  }
  if (esResuelta && usuario && usuario.rol !== 'anonimo') {
    acciones.push(`<button class="btn btn-outline" data-action="reclamacion:abrir" data-id="${esc(incidencia.id)}">
      <i class="bi bi-megaphone"></i> Reclamar solución
    </button>`);
  }
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
  // Si había una imagen elegida, se vuelve a pintar al reconstruir el modal.
  pintarAdjuntoComentario();
}

export function valorComentario() {
  return $('nuevoComentario')?.value.trim() || '';
}

export function archivoComentario() {
  return adjuntoComentarioSeleccionado?.archivo || $('nuevoComentarioArchivo')?.files?.[0] || null;
}

/** Id del adjunto ya subido para reintentar sin volver a subir la imagen. */
export function adjuntoComentarioPendiente() {
  return adjuntoComentarioId;
}

export function guardarAdjuntoComentarioPendiente(id) {
  adjuntoComentarioId = id || null;
}

/** Bloquea el botón mientras se sube y publica el comentario. */
export function marcarEnvioComentario(enviando) {
  const boton = $('nuevoComentarioEnviar');
  if (!boton) return;
  if (enviando) {
    boton.dataset.enviando = '1';
    boton.disabled = true;
    boton.innerHTML = '<i class="bi bi-hourglass-split"></i> Enviando…';
    return;
  }
  delete boton.dataset.enviando;
  boton.disabled = esperaComentarioSegundos > 0;
  boton.innerHTML = '<i class="bi bi-send-fill"></i> Comentar';
}

/**
 * Pinta el aviso de espera y habilita/deshabilita el envío.
 * Con 0 segundos se oculta el aviso y se vuelve a permitir comentar.
 */
export function actualizarEsperaComentario(segundos, motivo = '') {
  esperaComentarioSegundos = Math.max(0, Math.ceil(Number(segundos) || 0));
  const aviso = $('comentarioEspera');
  if (aviso) {
    const visible = esperaComentarioSegundos > 0;
    aviso.hidden = !visible;
    aviso.classList.toggle('u-oculto', !visible);
    aviso.textContent = visible
      ? motivo || mensajeDeEspera(esperaComentarioSegundos)
      : '';
  }
  const boton = $('nuevoComentarioEnviar');
  if (boton && boton.dataset.enviando !== '1') {
    boton.disabled = esperaComentarioSegundos > 0;
  }
}

export function puedeEnviarComentario() {
  return !comentarioBloqueadoPorEstado && esperaComentarioSegundos <= 0;
}

export function limpiarComentario() {
  const campo = $('nuevoComentario');
  if (campo) campo.value = '';
  quitarAdjuntoComentario();
}
