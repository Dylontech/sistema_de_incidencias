/** Vista de respaldos. */
import { $, esc, fmtFecha } from '../core/utils.js';

function tamano(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function renderResumen(estadisticas = {}) {
  const contenedor = $('respaldosResumen');
  if (!contenedor) return;
  contenedor.innerHTML = `
    <div class="stat-card"><div class="stat-num">${estadisticas.total ?? 0}</div><div class="stat-label">Respaldos</div></div>
    <div class="stat-card"><div class="stat-num">${estadisticas.listos ?? 0}</div><div class="stat-label">Listos</div></div>
    <div class="stat-card"><div class="stat-num">${tamano(estadisticas.tamanoTotal)}</div><div class="stat-label">Espacio usado</div></div>
    <div class="stat-card"><div class="stat-num">${estadisticas.ultimo ? fmtFecha(estadisticas.ultimo.creadoEn) : '—'}</div><div class="stat-label">Último respaldo</div></div>
    <div class="stat-card"><div class="stat-num">${estadisticas.siguienteAutomatico ? fmtFecha(estadisticas.siguienteAutomatico) : '—'}</div><div class="stat-label">Próximo automático</div></div>`;
}

export function renderizar(respaldos = [], { total = 0, pagina = 1, limite = 30 } = {}) {
  const contenedor = $('respaldosLista');
  if (!contenedor) return;
  if (!respaldos.length) {
    contenedor.innerHTML = '<tr><td colspan="6" class="celda-vacia">No hay respaldos que coincidan.</td></tr>';
  } else {
    contenedor.innerHTML = respaldos
      .map(
        (r) => `<tr>
          <td><strong>${esc(r.nombre)}</strong><div class="campo-nota">${esc(r.archivo)}</div></td>
          <td>${fmtFecha(r.creadoEn)}</td>
          <td>${esc(r.tipo)}</td>
          <td>${tamano(r.tamano)}</td>
          <td><span class="inc-badge badge-${r.estado === 'listo' || r.estado === 'restaurado' ? 'verde' : r.estado === 'error' ? 'rojo' : 'amarillo'}">${esc(r.estado)}</span></td>
          <td class="u-acciones-tabla">
            <button class="btn btn-outline btn-sm" data-action="respaldos:descargar" data-id="${esc(r.id)}" title="Descargar" aria-label="Descargar respaldo">
              <i class="bi bi-download"></i>
            </button>
            <button class="btn btn-outline btn-sm" data-action="respaldos:restaurar" data-id="${esc(r.id)}" title="Restaurar" aria-label="Restaurar respaldo">
              <i class="bi bi-arrow-counterclockwise"></i>
            </button>
            <button class="btn btn-danger btn-sm" data-action="respaldos:eliminar" data-id="${esc(r.id)}" title="Eliminar" aria-label="Eliminar respaldo">
              <i class="bi bi-trash3"></i>
            </button>
          </td>
        </tr>`
      )
      .join('');
  }
  const paginacion = $('respaldosPaginacion');
  if (paginacion) {
    const paginas = Math.max(Math.ceil(total / limite), 1);
    paginacion.innerHTML = `
      <button class="btn btn-outline btn-sm" data-action="respaldos:pagina" data-valor="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
      <span class="campo-nota">Página ${pagina} de ${paginas} · ${total} respaldos</span>
      <button class="btn btn-outline btn-sm" data-action="respaldos:pagina" data-valor="${pagina + 1}" ${pagina >= paginas ? 'disabled' : ''}>Siguiente →</button>`;
  }
}
