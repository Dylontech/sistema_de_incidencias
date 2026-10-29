/** Vista del historial de folios. */
import { $, esc, fmtFecha } from '../core/utils.js';

const ETIQUETAS = {
  incidencia: 'Incidencia',
  ticket: 'Ticket',
  informe: 'Informe',
  contacto: 'Contacto',
  sugerencia: 'Sugerencia',
  contacto_funcionario: 'Contacto directo',
  firmas: 'Firmas',
  mediacion: 'Mediación',
  acceso: 'Acceso'
};

export function renderizar({ folios = [], total = 0, pagina = 1, limite = 20, requiereCuenta = false } = {}) {
  const contenedor = $('foliosLista');
  if (!contenedor) return;
  if (requiereCuenta) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-person-lock"></i>
        <p>Crea una cuenta para consultar tus folios y trámites.</p>
        <button class="btn btn-primary btn-sm" data-action="auth:mostrarLogin" data-valor="registro">
          <i class="bi bi-person-plus-fill"></i> Crear cuenta
        </button>
      </div>`;
    return;
  }
  if (!folios.length) {
    contenedor.innerHTML = '<div class="empty-state"><i class="bi bi-search"></i><p>No hay folios que coincidan.</p></div>';
  } else {
    contenedor.innerHTML = `
      <div class="u-scroll-x">
        <table class="data-table">
          <thead><tr><th>Folio</th><th>Tipo</th><th>Título</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${folios
              .map(
                (f) => `<tr>
                  <td><strong>${esc(f.folio)}</strong></td>
                  <td>${esc(ETIQUETAS[f.tipo] || f.tipo)}</td>
                  <td>${esc(f.titulo)}</td>
                  <td>${fmtFecha(f.fecha)}</td>
                  <td>${esc(f.estado || '—')}</td>
                  <td><button class="btn btn-outline btn-sm" data-action="folios:abrirDetalle" data-valor="${esc(f.folio)}">
                    <i class="bi bi-box-arrow-up-right"></i> Abrir
                  </button></td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
  }
  const paginacion = $('foliosPaginacion');
  if (paginacion) {
    const paginas = Math.max(Math.ceil(total / limite), 1);
    paginacion.innerHTML = `
      <button class="btn btn-outline btn-sm" data-action="folios:pagina" data-valor="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
      <span class="campo-nota">Página ${pagina} de ${paginas} · ${total} folios</span>
      <button class="btn btn-outline btn-sm" data-action="folios:pagina" data-valor="${pagina + 1}" ${pagina >= paginas ? 'disabled' : ''}>Siguiente →</button>`;
  }
}

export function leerFiltros() {
  return {
    texto: $('foliosTexto')?.value?.trim() || '',
    tipo: $('foliosTipo')?.value || '',
    desde: $('foliosDesde')?.value || '',
    hasta: $('foliosHasta')?.value || ''
  };
}
