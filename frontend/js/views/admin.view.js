/** Vista del panel de administración (6 pestañas). */
import { $, esc, textoAntiguedad, etiquetaEstado } from '../core/utils.js';
import { renderListaTipos } from './tipos.view.js';

export function activarTab(nombre) {
  document.querySelectorAll('#modalAdmin .admin-panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('#modalAdmin .admin-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.valor === nombre);
  });
  $(`panel-${nombre}`)?.classList.add('active');
}

export function renderStats(panel) {
  const contenedor = $('statsGrid');
  if (!contenedor) return;
  if (!panel) {
    contenedor.innerHTML = '';
    $('statsByTipo').innerHTML = '';
    return;
  }

  contenedor.innerHTML = `
    <div class="stat-card"><div class="stat-num">${panel.total}</div><div class="stat-label">Total</div></div>
    <div class="stat-card amarillo"><div class="stat-num">${panel.reportadas}</div><div class="stat-label">Reportadas</div></div>
    <div class="stat-card"><div class="stat-num">${panel.enProceso}</div><div class="stat-label">En proceso</div></div>
    <div class="stat-card verde"><div class="stat-num">${panel.resueltas}</div><div class="stat-label">Resueltas</div></div>
    <div class="stat-card rojo"><div class="stat-num">${panel.criticas}</div><div class="stat-label">&gt;30 días</div></div>
    <div class="stat-card naranja"><div class="stat-num">${panel.naranjas}</div><div class="stat-label">15–30 días</div></div>
    <div class="stat-card amarillo"><div class="stat-num">${panel.amarillas}</div><div class="stat-label">&lt;15 días</div></div>
  `;

  $('statsByTipo').innerHTML =
    panel.porTipo
      .map(
        (fila) => `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
          <span>${fila.icono} ${esc(fila.nombre)}</span>
          <span><strong>${fila.total}</strong> (${fila.porcentaje}%)</span>
        </div>
        <div style="height:8px;background:#f0f4f8;border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${fila.porcentaje}%;background:linear-gradient(90deg,var(--primario),var(--primario-claro));"></div>
        </div>
      </div>`
      )
      .join('') || '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:16px;">Sin datos</div>';
}

export function renderTablaIncidencias(incidencias = [], { tipos = [], esAdmin = false, busqueda = '' } = {}) {
  const cuerpo = $('adminIncidenciasBody');
  if (!cuerpo) return;

  const filtro = busqueda.trim().toLowerCase();
  const lista = filtro
    ? incidencias.filter((i) => (i.titulo || '').toLowerCase().includes(filtro))
    : incidencias;

  if (!lista.length) {
    cuerpo.innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px;">Sin incidencias</td></tr>';
    return;
  }

  cuerpo.innerHTML = lista
    .slice()
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .map((inc) => {
      const tipo = tipos.find((t) => t.id === inc.tipoId);
      return `
        <tr>
          <td><code style="font-size:10.5px;">${esc(inc.id.slice(-6))}</code></td>
          <td><strong>${esc(inc.titulo)}</strong></td>
          <td>${tipo ? tipo.icono + ' ' + esc(tipo.nombre) : '—'}</td>
          <td><span class="inc-badge badge-${inc.color}">${etiquetaEstado(inc.estado)}</span></td>
          <td>${inc.estado === 'resuelta' ? '—' : textoAntiguedad(inc.dias)}</td>
          <td>${esc(inc.esAnonimo ? 'Anónimo' : inc.autorNombre)}</td>
          <td>
            <button class="btn btn-sm btn-outline" data-action="admin:verDetalle" data-id="${esc(inc.id)}">
              <i class="bi bi-eye"></i>
            </button>
            ${
              esAdmin
                ? `<button class="btn btn-sm btn-danger" data-action="admin:eliminar" data-id="${esc(inc.id)}">
                     <i class="bi bi-trash3"></i>
                   </button>`
                : ''
            }
          </td>
        </tr>`;
    })
    .join('');
}

export function renderTipos(tipos, { puedeEliminar = true } = {}) {
  renderListaTipos(tipos, { puedeEliminar });
}

export function renderMunicipios(municipios = [], activoId) {
  const selector = $('municipioSelect');
  if (selector) {
    selector.innerHTML = municipios
      .map(
        (m) =>
          `<option value="${esc(m.id)}" ${m.id === activoId ? 'selected' : ''}>${esc(m.nombre)}, ${esc(m.estado)}</option>`
      )
      .join('');
  }

  const contenedor = $('municipiosLista');
  if (!contenedor) return;
  contenedor.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Municipio</th><th>Estado</th><th>Clave de acceso</th><th>Centro</th></tr></thead>
      <tbody>
        ${municipios
          .map(
            (m) => `
          <tr>
            <td><strong>${esc(m.nombre)}</strong>${
              m.id === activoId
                ? ' <span style="font-size:10px;background:#e8f5f2;color:#006657;padding:2px 8px;border-radius:10px;">ACTIVO</span>'
                : ''
            }</td>
            <td>${esc(m.estado)}</td>
            <td>${m.clave ? `<code style="font-size:11px;">${esc(m.clave)}</code>` : '<span style="font-size:11px;color:#94a3b8;">Oculta</span>'}</td>
            <td>${Number(m.center[0]).toFixed(4)}, ${Number(m.center[1]).toFixed(4)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

export function renderZonas(zonas = []) {
  const contenedor = $('zonasLista');
  if (!contenedor) return;
  contenedor.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Color</th><th>Zona</th><th>Tipo</th><th>Reportes</th><th>Pendientes</th><th>Resueltos</th></tr></thead>
        <tbody>
          ${
            zonas
              .map(
                (z) => `
            <tr>
              <td><span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${esc(z.color)};"></span></td>
              <td>${esc(z.nombre)}</td>
              <td style="text-transform:capitalize;">${esc(z.tipo)}</td>
              <td><strong>${z.reportes}</strong></td>
              <td>${z.pendientes}</td>
              <td>${z.resueltas}</td>
            </tr>`
              )
              .join('') ||
            '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px;">Sin zonas definidas para este municipio</td></tr>'
          }
        </tbody>
      </table>
    </div>`;
}

export function renderUsuarios(usuarios = [], municipios = []) {
  const contenedor = $('usuariosLista');
  if (!contenedor) return;
  contenedor.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Municipio</th><th>Activo</th></tr></thead>
      <tbody>
        ${usuarios
          .map((u) => {
            const municipio = municipios.find((m) => m.id === u.municipioId);
            return `
            <tr>
              <td><code>${esc(u.username)}</code></td>
              <td>${esc(u.nombre)}</td>
              <td><span style="background:#e8f5f2;color:#006657;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${esc(u.rol)}</span></td>
              <td>${municipio ? esc(municipio.nombre) : '—'}</td>
              <td>${u.activo !== false ? '✅' : '❌'}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

export function valorMunicipioSeleccionado() {
  return $('municipioSelect')?.value || null;
}

export function valorBusqueda() {
  return $('adminBuscar')?.value || '';
}
