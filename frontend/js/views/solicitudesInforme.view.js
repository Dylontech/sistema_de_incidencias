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
