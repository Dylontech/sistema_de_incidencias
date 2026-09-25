/** Vista del panel de administración (6 pestañas). */
import { $, esc, textoAntiguedad, etiquetaEstado, fmtFechaCorta } from '../core/utils.js';
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
    <div class="stat-card peligro"><div class="stat-num">${panel.peligrosas ?? 0}</div><div class="stat-label">⚠️ Peligrosas</div></div>
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

/**
 * Bloque destacado del panel: las incidencias marcadas como peligrosas se
 * muestran EN GRANDE, por encima de la tabla y de las estadísticas, con su
 * icono, la comunidad, los días que llevan abiertas y el motivo de la marca.
 */
export function renderPeligrosas(incidencias = [], { tipos = [] } = {}) {
  const contenedor = $('peligrosasDestacadas');
  if (!contenedor) return;

  const peligrosas = incidencias
    .filter((i) => i.peligrosa === true && i.estado !== 'resuelta')
    .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));

  if (!peligrosas.length) {
    contenedor.innerHTML = '';
    return;
  }

  contenedor.innerHTML = `
    <div class="peligro-panel">
      <div class="peligro-panel-head">
        <h3>
          <i class="bi bi-exclamation-triangle-fill"></i> Incidencias peligrosas
          <span class="peligro-contador">${peligrosas.length}</span>
        </h3>
        <p>Señaladas por el personal: atiéndelas antes que el resto.</p>
      </div>
      <div class="peligro-lista">
        ${peligrosas.map((inc) => tarjetaPeligro(inc, tipos)).join('')}
      </div>
    </div>`;
}

/** Tarjeta grande de una incidencia peligrosa. */
function tarjetaPeligro(inc, tipos = []) {
  const tipo = tipos.find((t) => t.id === inc.tipoId);
  const icono = inc.iconoCustom || (tipo ? tipo.icono : '❗');
  const marcada = inc.peligrosaFecha
    ? `Marcada ${fmtFechaCorta(inc.peligrosaFecha)}${inc.peligrosaPor ? ' por ' + inc.peligrosaPor : ''}`
    : '';

  return `
    <article class="peligro-card">
      <div class="peligro-icono">${icono}</div>
      <h4>${esc(inc.titulo)}</h4>
      <div class="peligro-meta">
        <span><i class="bi bi-tag-fill"></i> ${esc(tipo ? tipo.nombre : '—')}</span>
        <span><i class="bi bi-geo-fill"></i> ${esc(inc.zonaNombre || 'Sin comunidad')}</span>
        <span><i class="bi bi-clock-history"></i> ${inc.dias === null ? 'resuelta' : textoAntiguedad(inc.dias)}</span>
        <span><i class="bi bi-person-fill"></i> ${esc(inc.esAnonimo ? 'Anónimo' : inc.autorNombre || '—')}</span>
        ${marcada ? `<span><i class="bi bi-exclamation-triangle-fill"></i> ${esc(marcada)}</span>` : ''}
      </div>
      ${
        inc.peligrosaMotivo
          ? `<div class="peligro-motivo"><strong>Motivo:</strong> ${esc(inc.peligrosaMotivo)}</div>`
          : ''
      }
      <div class="peligro-acciones">
        <button class="btn btn-sm btn-primary" data-action="admin:verDetalle" data-id="${esc(inc.id)}">
          <i class="bi bi-eye"></i> Ver / atender
        </button>
        <button class="btn btn-sm btn-outline" data-action="admin:marcarPeligro" data-id="${esc(inc.id)}" data-valor="quitar">
          <i class="bi bi-shield-check"></i> Quitar marca
        </button>
      </div>
    </article>`;
}

export function renderTablaIncidencias(incidencias = [], { tipos = [], esAdmin = false, busqueda = '', soloPeligrosas = false } = {}) {
  const cuerpo = $('adminIncidenciasBody');
  if (!cuerpo) return;

  const filtro = busqueda.trim().toLowerCase();
  const lista = incidencias
    .filter((i) => (soloPeligrosas ? i.peligrosa === true : true))
    .filter((i) => (filtro ? (i.titulo || '').toLowerCase().includes(filtro) : true));

  if (!lista.length) {
    cuerpo.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px;">${
      soloPeligrosas ? 'No hay incidencias peligrosas' : 'Sin incidencias'
    }</td></tr>`;
    return;
  }

  cuerpo.innerHTML = lista
    .slice()
    .sort(
      (a, b) =>
        Number(b.peligrosa === true) - Number(a.peligrosa === true) ||
        new Date(b.fecha) - new Date(a.fecha)
    )
    .map((inc) => {
      const tipo = tipos.find((t) => t.id === inc.tipoId);
      return `
        <tr class="${inc.peligrosa ? 'fila-peligrosa' : ''}">
          <td><code style="font-size:10.5px;">${esc(inc.id.slice(-6))}</code></td>
          <td>
            ${inc.peligrosa ? '<span class="inc-badge badge-peligro" title="Incidencia peligrosa">⚠️ PELIGROSA</span> ' : ''}
            <strong>${esc(inc.titulo)}</strong>
          </td>
          <td>${tipo ? tipo.icono + ' ' + esc(tipo.nombre) : '—'}</td>
          <td><span class="inc-badge badge-${inc.color}">${etiquetaEstado(inc.estado)}</span></td>
          <td>${inc.estado === 'resuelta' ? '—' : textoAntiguedad(inc.dias)}</td>
          <td>${esc(inc.esAnonimo ? 'Anónimo' : inc.autorNombre)}</td>
          <td>
            <button class="btn btn-sm btn-outline" data-action="admin:verDetalle" data-id="${esc(inc.id)}">
              <i class="bi bi-eye"></i>
            </button>
            <button class="btn btn-sm ${inc.peligrosa ? 'btn-danger' : 'btn-outline'}"
              data-action="admin:marcarPeligro" data-id="${esc(inc.id)}"
              data-valor="${inc.peligrosa ? 'quitar' : 'marcar'}"
              title="${inc.peligrosa ? 'Quitar la marca de peligro' : 'Marcar como peligrosa'}">
              <i class="bi bi-exclamation-triangle-fill"></i>
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

export function renderUsuarios(usuarios = [], municipios = [], { esAdmin = false } = {}) {
  const contenedor = $('usuariosLista');
  if (!contenedor) return;

  const botonNuevo = $('btnNuevoUsuario');
  if (botonNuevo) botonNuevo.style.display = esAdmin ? 'inline-flex' : 'none';

  if (!usuarios.length) {
    contenedor.innerHTML =
      '<div class="empty-state"><i class="bi bi-person-badge"></i><div>No hay cuentas del personal dadas de alta</div></div>';
    return;
  }

  contenedor.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Usuario</th><th>Nombre</th><th>Rol</th><th>Municipio</th><th>Estado</th>
            ${esAdmin ? '<th>Acciones</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${usuarios
            .map((u) => {
              const municipio = municipios.find((m) => m.id === u.municipioId);
              return `
              <tr>
                <td><code>${esc(u.username)}</code></td>
                <td>${esc(u.nombre)}${u.correo ? `<div class="campo-nota">${esc(u.correo)}</div>` : ''}</td>
                <td><span class="inc-badge badge-${u.rol === 'admin' ? 'rojo' : 'amarillo'}">${esc(u.rol)}</span></td>
                <td>${municipio ? esc(municipio.nombre) : '—'}</td>
                <td>${u.activo !== false ? '✅ Activa' : '🚫 Inactiva'}</td>
                ${
                  esAdmin
                    ? `<td>
                         <button class="btn btn-sm btn-outline" data-action="admin:usuarioEditar" data-id="${esc(u.id)}" title="Editar cuenta">
                           <i class="bi bi-pencil-square"></i>
                         </button>
                       </td>`
                    : ''
                }
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/* ---------------------- alta / edición del personal ---------------------- */

/**
 * Prepara el modal de usuario.
 * Sin `usuario` es un alta; con él, una edición en la que el usuario de acceso
 * queda bloqueado (es la llave de entrada y el `userKey` de sus reportes).
 */
export function prepararModalUsuario({ usuario = null, municipios = [] } = {}) {
  const edicion = Boolean(usuario);

  $('modalUsuarioTitle').textContent = edicion ? 'Editar usuario' : 'Nuevo usuario';
  $('usuarioId').value = usuario?.id || '';
  $('usuarioUsernameBox').style.display = edicion ? 'none' : 'block';
  $('usuarioUsername').value = usuario?.username || '';
  $('usuarioNombre').value = usuario?.nombre || '';
  $('usuarioRol').value = usuario?.rol || 'funcionario';

  renderSelectMunicipiosUsuario(municipios, usuario?.municipioId || null);

  $('usuarioCorreo').value = usuario?.correo || '';
  $('usuarioPassword').value = '';
  $('usuarioPasswordNota').textContent = edicion
    ? 'Déjala vacía para conservar la contraseña actual.'
    : 'Mínimo 8 caracteres.';

  $('usuarioActivoBox').style.display = edicion ? 'block' : 'none';
  $('usuarioActivo').checked = usuario?.activo !== false;

  actualizarNotaMunicipioUsuario();
}

/** Rellena el selector de municipio con el catálogo activo. */
export function renderSelectMunicipiosUsuario(municipios = [], activoId = null) {
  const selector = $('usuarioMunicipio');
  if (!selector) return;
  selector.innerHTML =
    '<option value="">— Sin municipio —</option>' +
    municipios.map((m) => `<option value="${esc(m.id)}">${esc(m.nombre)}, ${esc(m.estado)}</option>`).join('');
  if (activoId) selector.value = activoId;
}

/** El funcionario necesita municipio; el administrador puede quedarse sin él. */
export function actualizarNotaMunicipioUsuario() {
  const nota = $('usuarioMunicipioBox')?.querySelector('.campo-nota');
  if (!nota) return;
  nota.textContent =
    $('usuarioRol')?.value === 'funcionario'
      ? 'Obligatorio: el funcionario solo ve y gestiona este municipio.'
      : 'Opcional: un administrador sin municipio trabaja con el activo de la barra superior.';
}

export function valoresUsuarioForm() {
  return {
    id: $('usuarioId').value.trim() || null,
    username: $('usuarioUsername').value.trim(),
    nombre: $('usuarioNombre').value.trim(),
    rol: $('usuarioRol').value,
    municipioId: $('usuarioMunicipio').value || null,
    correo: $('usuarioCorreo').value.trim() || null,
    password: $('usuarioPassword').value,
    activo: $('usuarioActivo').checked
  };
}

export function valorMunicipioSeleccionado() {
  return $('municipioSelect')?.value || null;
}

export function valorBusqueda() {
  return $('adminBuscar')?.value || '';
}
