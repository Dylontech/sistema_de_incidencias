/** Vista del panel de firmas para personal y administradores. */
import { $, esc, fmtFecha } from '../core/utils.js';

const ESTADOS = {
  abierta: 'Abierta',
  meta_alcanzada: 'Meta alcanzada',
  enviada: 'Enviada',
  cerrada: 'Cerrada'
};

export function renderizar(recolecciones = [], { esAdmin = false, texto = '' } = {}) {
  const contenedor = $('firmasAdminLista');
  if (!contenedor) return;
  const busqueda = String(texto || '').trim().toLowerCase();
  const lista = recolecciones.filter(
    (r) =>
      !busqueda ||
      String(r.titulo || '').toLowerCase().includes(busqueda) ||
      String(r.incidenciaFolio || '').toLowerCase().includes(busqueda) ||
      String(r.municipioId || '').toLowerCase().includes(busqueda)
  );
  if (!lista.length) {
    contenedor.innerHTML =
      '<div class="empty-state"><i class="bi bi-pen"></i><p>No hay recolecciones de firmas.</p></div>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr>
          <th>Título</th><th>Tipo</th><th>Municipio</th><th>Firmas</th><th>Estado</th><th>Creada</th><th>Acciones</th>
        </tr></thead>
        <tbody>
          ${lista
            .map((r) => {
              const total = Number(r.total) || 0;
              const meta = Number(r.meta) || 0;
              return `<tr>
                <td>
                  <strong>${esc(r.titulo)}</strong>
                  ${r.incidenciaFolio ? `<div class="campo-nota">${esc(r.incidenciaFolio)}</div>` : ''}
                </td>
                <td>${r.tipo === 'incidencia' ? 'Incidencia' : 'Municipio'}</td>
                <td>${esc(r.municipioId || '—')}</td>
                <td>${total}${meta ? ` / ${meta}` : ''}</td>
                <td><span class="inc-badge badge-${r.estado === 'meta_alcanzada' || r.estado === 'enviada' ? 'verde' : 'gris'}">${esc(ESTADOS[r.estado] || r.estado)}</span></td>
                <td>${fmtFecha(r.creadoEn)}</td>
                <td class="u-acciones-tabla">
                  <button class="btn btn-outline btn-sm" data-action="firmasAdmin:detalle" data-id="${esc(r.id)}" title="Ver firmantes" aria-label="Ver firmantes">
                    <i class="bi bi-eye"></i>
                  </button>
                  <button class="btn btn-outline btn-sm" data-action="firmasAdmin:exportar" data-id="${esc(r.id)}" data-valor="csv" title="Descargar CSV" aria-label="Descargar CSV">
                    <i class="bi bi-filetype-csv"></i>
                  </button>
                  <button class="btn btn-outline btn-sm" data-action="firmasAdmin:exportar" data-id="${esc(r.id)}" data-valor="pdf" title="Descargar PDF" aria-label="Descargar PDF">
                    <i class="bi bi-filetype-pdf"></i>
                  </button>
                  ${
                    esAdmin
                      ? `<button class="btn btn-primary btn-sm" data-action="firmasAdmin:enviar" data-id="${esc(r.id)}" title="Enviar al funcionario" aria-label="Enviar al funcionario">
                           <i class="bi bi-send"></i>
                         </button>`
                      : ''
                  }
                </td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

export function renderDetalle(recoleccion) {
  const contenedor = $('firmaDetalleBody');
  if (!contenedor || !recoleccion) return;
  const firmantes = recoleccion.firmantes || [];
  contenedor.innerHTML = `
    <div class="detail-row"><div class="label">Título</div><div class="value">${esc(recoleccion.titulo)}</div></div>
    <div class="detail-row"><div class="label">Meta</div><div class="value">${recoleccion.total} / ${recoleccion.meta}</div></div>
    <div class="detail-row"><div class="label">Estado</div><div class="value">${esc(ESTADOS[recoleccion.estado] || recoleccion.estado)}</div></div>
    <div class="detail-row"><div class="label">Descripción</div><div class="value">${esc(recoleccion.descripcion || '—')}</div></div>
    <h4 class="moderacion-titulo u-mt-10">Firmantes (${firmantes.length})</h4>
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>#</th><th>Nombre</th><th>Fecha</th></tr></thead>
        <tbody>
          ${firmantes
            .map(
              (f, i) =>
                `<tr><td>${i + 1}</td><td>${esc(f.nombre || 'Ciudadano')}</td><td>${fmtFecha(f.creadoEn)}</td></tr>`
            )
            .join('') || '<tr><td colspan="3" class="celda-vacia">Sin firmas todavía</td></tr>'}
        </tbody>
      </table>
    </div>`;
}
