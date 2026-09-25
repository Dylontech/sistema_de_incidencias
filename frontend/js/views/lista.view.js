/** Vista del listado lateral: filtros y tarjetas de incidencia. */
import { $, esc, textoDias, etiquetaEstado } from '../core/utils.js';

export function renderizarFiltros({ tipos = [], zonas = [], filtros = {} }) {
  const selectTipo = $('filterTipo');
  if (selectTipo) {
    selectTipo.innerHTML =
      '<option value="todos">Todos los tipos</option>' +
      tipos.map((t) => `<option value="${esc(t.id)}">${t.icono} ${esc(t.nombre)}</option>`).join('');
    selectTipo.value = tipos.some((t) => t.id === filtros.tipo) ? filtros.tipo : 'todos';
  }

  const selectZona = $('filterZona');
  if (selectZona) {
    selectZona.innerHTML =
      '<option value="todos">Todas las comunidades</option>' +
      zonas.map((z) => `<option value="${esc(z.id)}">${esc(z.nombre)}</option>`).join('');
    selectZona.value = zonas.some((z) => z.id === filtros.zona) ? filtros.zona : 'todos';
  }

  if ($('filterEstado')) $('filterEstado').value = filtros.estado || 'todos';
  if ($('filterColor')) $('filterColor').value = filtros.color || 'todos';
  if ($('filterOrden')) $('filterOrden').value = filtros.orden || 'reciente';
  if ($('filterText') && document.activeElement !== $('filterText')) {
    $('filterText').value = filtros.texto || '';
  }
}

export function leerFiltros() {
  return {
    texto: $('filterText')?.value.trim() || '',
    estado: $('filterEstado')?.value || 'todos',
    tipo: $('filterTipo')?.value || 'todos',
    color: $('filterColor')?.value || 'todos',
    zona: $('filterZona')?.value || 'todos',
    orden: $('filterOrden')?.value || 'reciente'
  };
}

export function renderizar(incidencias = [], { tipos = [], esCiudadano = false } = {}) {
  const contenedor = $('listaIncidencias');
  if (!contenedor) return;

  if (!incidencias.length) {
    contenedor.innerHTML = `<div class="empty-state">
      <i class="bi bi-inbox"></i>
      <div>${esCiudadano ? 'Aún no has reportado ninguna incidencia' : 'No hay incidencias que mostrar'}</div>
      <div style="font-size:11.5px;margin-top:6px;">
        ${esCiudadano ? 'Usa el botón + para reportar tu primera incidencia' : 'Prueba ajustar los filtros o reporta una nueva'}
      </div>
    </div>`;
    return;
  }

  contenedor.innerHTML = incidencias
    .map((inc) => {
      const tipo = tipos.find((t) => t.id === inc.tipoId);
      const autor = inc.esAnonimo ? 'Anónimo' : inc.autorNombre;
      return `
        <div class="incidencia-card estado-${inc.color}${inc.peligrosa ? ' peligrosa' : ''}" data-action="detalle:abrir" data-id="${esc(inc.id)}">
          <div class="inc-head">
            <span class="inc-icon">${inc.iconoCustom || (tipo ? tipo.icono : '❗')}</span>
            <div class="inc-title">${esc(inc.titulo)}</div>
          </div>
          <div class="inc-desc">${esc(inc.descripcion)}</div>
          <div class="inc-meta">
            <span><i class="bi bi-clock"></i> ${textoDias(inc.dias)}</span>
            <span class="inc-badge badge-${inc.color}">${etiquetaEstado(inc.estado)}</span>
            ${inc.peligrosa ? '<span class="inc-badge badge-peligro" title="Marcada por el personal como peligrosa">⚠️ PELIGROSA</span>' : ''}
          </div>
          <div class="inc-meta" style="margin-top:4px;">
            <span><i class="bi bi-person"></i> ${esc(autor)}</span>
            <span>${esc(tipo ? tipo.nombre : '—')}</span>
          </div>
        </div>`;
    })
    .join('');
}
