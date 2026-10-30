/** Vista de solicitudes públicas de informe (admin). */
import { $, esc } from '../core/utils.js';

const ESTADOS = {
  pendiente_verificacion: 'Pendiente de verificar',
  pendiente: 'Pendiente',
  procesando: 'Procesando',
  generada: 'Generada, lista para enviar',
  enviada: 'Enviada',
  error: 'Error',
  rechazada: 'Rechazada'
};

function fechaCorta(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleDateString('es-MX', { dateStyle: 'short' });
}

function territorio(solicitud) {
  const municipios = solicitud.municipios?.length
    ? solicitud.municipios.join(', ')
    : solicitud.municipioId || '';
  const estados = solicitud.estados?.length
    ? solicitud.estados.join(', ')
    : solicitud.estadoEntidad || '';
  return [municipios && `Municipios: ${municipios}`, estados && `Estados: ${estados}`]
    .filter(Boolean)
    .join(' · ');
}

function fechaHora(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? '—'
    : fecha.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

const ETIQUETA_ESTADO = (solicitud) =>
  ESTADOS[solicitud.estado] || solicitud.estado || 'Sin estado';

/**
 * Resumen detallado de una solicitud. Se abre desde la tabla y desde la
 * notificación para revisar todos los datos antes de generarla o enviarla.
 */
export function renderizarDetalle(solicitud = {}) {
  const contenedor = $('solicitudInformeDetalleCuerpo');
  if (!contenedor) return;
  const tipos = solicitud.tiposTodos
    ? 'Todos los tipos'
    : (solicitud.tipos || []).join(', ') || '—';
  const id = esc(solicitud.id || '');
  contenedor.innerHTML = `
    <div class="detalle-solicitud">
      <div class="detalle-solicitud-cabecera">
        <div>
          <div class="campo-nota">Folio</div>
          <h4 class="u-m-0">${esc(solicitud.folio || '—')}</h4>
        </div>
        <span class="inc-badge badge-${solicitud.estado === 'enviada' ? 'verde' : solicitud.estado === 'error' || solicitud.estado === 'rechazada' ? 'rojo' : 'amarillo'}">${esc(ETIQUETA_ESTADO(solicitud))}</span>
      </div>
      <div class="detalle-solicitud-grid">
        <div><span class="campo-nota">Solicitante</span><strong>${esc(solicitud.nombre || '—')}</strong></div>
        <div><span class="campo-nota">Correo</span><strong>${esc(solicitud.correo || '—')}</strong></div>
        <div><span class="campo-nota">Teléfono</span><strong>${esc(solicitud.telefono || '—')}</strong></div>
        <div><span class="campo-nota">Formato</span><strong>${esc(String(solicitud.formato || 'pdf').toUpperCase())}</strong></div>
        <div><span class="campo-nota">Ámbito</span><strong>${esc(solicitud.ambito || solicitud.ambitos || '—')}</strong></div>
        <div><span class="campo-nota">Tipos</span><strong>${esc(tipos)}</strong></div>
        <div class="detalle-solicitud-ancho"><span class="campo-nota">Territorio</span><strong>${esc(territorio(solicitud) || '—')}</strong></div>
        <div><span class="campo-nota">Desde</span><strong>${esc(fechaCorta(solicitud.desde))}</strong></div>
        <div><span class="campo-nota">Hasta</span><strong>${esc(fechaCorta(solicitud.hasta))}</strong></div>
        <div><span class="campo-nota">Creada</span><strong>${esc(fechaHora(solicitud.creadoEn))}</strong></div>
        <div><span class="campo-nota">Procesada</span><strong>${esc(fechaHora(solicitud.procesadoEn))}</strong></div>
        <div><span class="campo-nota">Enviada</span><strong>${esc(fechaHora(solicitud.enviadoEn))}</strong></div>
      </div>
      ${
        solicitud.mensaje
          ? `<div class="detalle-solicitud-bloque"><span class="campo-nota">Mensaje del solicitante</span><p class="u-m-0">${esc(solicitud.mensaje)}</p></div>`
          : ''
      }
      ${
        solicitud.error
          ? `<div class="detalle-solicitud-bloque detalle-solicitud-error"><span class="campo-nota">Error</span><p class="u-m-0">${esc(solicitud.error)}</p></div>`
          : ''
      }
      <div class="u-fila-env u-mt-12">
        <button class="btn btn-outline btn-sm" data-action="solicitudesInforme:vista" data-id="${id}" data-valor="pdf"><i class="bi bi-filetype-pdf"></i> Vista previa PDF</button>
        <button class="btn btn-outline btn-sm" data-action="solicitudesInforme:vista" data-id="${id}" data-valor="csv"><i class="bi bi-filetype-csv"></i> Vista previa CSV</button>
        ${
          solicitud.archivo
            ? `<button class="btn btn-outline btn-sm" data-action="solicitudesInforme:archivo" data-id="${id}"><i class="bi bi-eye-fill"></i> Abrir archivo</button>`
            : ''
        }
        <button class="btn btn-outline btn-sm" data-action="solicitudesInforme:generar" data-id="${id}"><i class="bi bi-gear"></i> Generar</button>
        <button class="btn btn-primary btn-sm" data-action="solicitudesInforme:enviar" data-id="${id}"><i class="bi bi-send"></i> Enviar</button>
      </div>
    </div>`;
}

export function renderizar(solicitudes = [], { texto = '', estado = '' } = {}) {
  const contenedor = $('solicitudesInformeLista');
  if (!contenedor) return;
  const busqueda = String(texto || '').trim().toLowerCase();
  const lista = solicitudes.filter(
    (s) =>
      (!estado || s.estado === estado) &&
      (!busqueda ||
        String(s.folio || '').toLowerCase().includes(busqueda) ||
        String(s.correo || '').toLowerCase().includes(busqueda) ||
        String(s.nombre || '').toLowerCase().includes(busqueda))
  );
  if (!lista.length) {
    contenedor.innerHTML =
      '<div class="empty-state"><i class="bi bi-file-earmark-bar-graph"></i><p>No hay solicitudes de informe.</p></div>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Folio</th><th>Solicitante</th><th>Territorio</th><th>Fechas</th><th>Formato</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
          ${lista
            .map(
              (s) => `<tr>
                <td><strong>${esc(s.folio)}</strong></td>
                <td>${esc(s.nombre)}<div class="campo-nota">${esc(s.correo)}</div></td>
                <td>${esc(territorio(s))}<div class="campo-nota">${s.tiposTodos ? 'Todos los tipos' : `${s.tipos?.length || 0} tipos`}</div></td>
                <td>${fechaCorta(s.desde)} a ${fechaCorta(s.hasta)}</td>
                <td>${esc(String(s.formato || 'pdf').toUpperCase())}</td>
                <td><span class="inc-badge badge-${s.estado === 'enviada' ? 'verde' : s.estado === 'error' || s.estado === 'rechazada' ? 'rojo' : 'amarillo'}">${esc(ESTADOS[s.estado] || s.estado)}</span></td>
                <td class="u-acciones-tabla">
                  <button class="btn btn-outline btn-sm" data-action="solicitudesInforme:detalle" data-id="${esc(s.id)}" title="Ver resumen completo" aria-label="Ver resumen completo">
                    <i class="bi bi-layout-text-window-reverse"></i>
                  </button>
                  ${s.archivo ? `
                  <button class="btn btn-outline btn-sm" data-action="solicitudesInforme:archivo" data-id="${esc(s.id)}" title="Ver archivo generado" aria-label="Ver archivo generado">
                    <i class="bi bi-eye-fill"></i>
                  </button>
                  <button class="btn btn-outline btn-sm" data-action="solicitudesInforme:descargar" data-id="${esc(s.id)}" title="Descargar archivo generado" aria-label="Descargar archivo generado">
                    <i class="bi bi-download"></i>
                  </button>` : ''}
                  <button class="btn btn-outline btn-sm" data-action="solicitudesInforme:vista" data-id="${esc(s.id)}" data-valor="pdf" title="Vista previa PDF" aria-label="Vista previa PDF">
                    <i class="bi bi-filetype-pdf"></i>
                  </button>
                  <button class="btn btn-outline btn-sm" data-action="solicitudesInforme:vista" data-id="${esc(s.id)}" data-valor="csv" title="Vista previa CSV" aria-label="Vista previa CSV">
                    <i class="bi bi-filetype-csv"></i>
                  </button>
                  <button class="btn btn-outline btn-sm" data-action="solicitudesInforme:generar" data-id="${esc(s.id)}" title="Generar" aria-label="Generar informe">
                    <i class="bi bi-gear"></i>
                  </button>
                  <button class="btn btn-primary btn-sm" data-action="solicitudesInforme:enviar" data-id="${esc(s.id)}" title="Enviar" aria-label="Enviar informe">
                    <i class="bi bi-send"></i>
                  </button>
                  <button class="btn btn-outline btn-sm" data-action="solicitudesInforme:reintentar" data-id="${esc(s.id)}" title="Reintentar" aria-label="Reintentar envío">
                    <i class="bi bi-arrow-repeat"></i>
                  </button>
                  <button class="btn btn-danger btn-sm" data-action="solicitudesInforme:rechazar" data-id="${esc(s.id)}" title="Rechazar" aria-label="Rechazar solicitud">
                    <i class="bi bi-x-circle"></i>
                  </button>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}
