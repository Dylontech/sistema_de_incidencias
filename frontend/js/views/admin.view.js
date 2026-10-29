/** Vista del panel de administración (6 pestañas). */
import { $, esc, textoAntiguedad, etiquetaEstado, fmtFechaCorta, aplicarEstilosDinamicos } from '../core/utils.js';
import { crearSelectorTerritorial } from '../core/selector-territorial.js';
import { crearSelectorTerritorialPorEstado } from '../core/selector-territorial-bloques.js';
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

  const porTipo = $('statsByTipo');
  porTipo.innerHTML =
    panel.porTipo
      .map(
        (fila) => `
      <div class="u-mb-10">
        <div class="pila-filas">
          <span>${fila.icono} ${esc(fila.nombre)}</span>
          <span><strong>${fila.total}</strong> (${fila.porcentaje}%)</span>
        </div>
        <div class="barra-progreso">
          <div class="barra-relleno" data-ancho="${fila.porcentaje}%"></div>
        </div>
      </div>`
      )
      .join('') || '<div class="vacio-suave u-centro u-p-16">Sin datos</div>';
  // El ancho de cada barra es un dato: se aplica por CSSOM.
  aplicarEstilosDinamicos(porTipo);
  renderTiempos(panel.tiempos);
  renderComparativo(panel.comparativo || [], panel.comparativoEstados || []);
}

function numeroDias(valor) {
  return valor === null || valor === undefined ? '—' : `${Number(valor).toFixed(1)} d`;
}

/** Resumen de tiempos y tabla de las resoluciones más lentas. */
function renderTiempos(tiempos = null) {
  const contenedor = $('statsTiempos');
  if (!contenedor) return;
  if (!tiempos || !tiempos.muestra) {
    contenedor.innerHTML =
      '<p class="campo-nota">Aún no hay incidencias resueltas con fecha de resolución en este territorio.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="stats-grid u-mb-10">
      <div class="stat-card verde"><div class="stat-num">${numeroDias(tiempos.promedio)}</div><div class="stat-label">Promedio</div></div>
      <div class="stat-card"><div class="stat-num">${numeroDias(tiempos.mediana)}</div><div class="stat-label">Mediana</div></div>
      <div class="stat-card amarillo"><div class="stat-num">${numeroDias(tiempos.minimo)}</div><div class="stat-label">Más rápida</div></div>
      <div class="stat-card rojo"><div class="stat-num">${numeroDias(tiempos.maximo)}</div><div class="stat-label">Más lenta</div></div>
      <div class="stat-card"><div class="stat-num">${tiempos.muestra}</div><div class="stat-label">Resueltas medidas</div></div>
    </div>
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Incidencia</th><th>Municipio</th><th>Fecha</th><th>Resuelta</th><th>Días</th></tr></thead>
        <tbody>
          ${(tiempos.detalle || [])
            .slice(0, 40)
            .map(
              (fila) => `<tr>
                <td><strong>${esc(fila.titulo)}</strong></td>
                <td>${esc(fila.municipio)}, ${esc(fila.estadoEntidad)}</td>
                <td>${fmtFechaCorta(fila.fecha)}</td>
                <td>${fmtFechaCorta(fila.fechaResolucion)}</td>
                <td><span class="inc-badge badge-${fila.diasResolucion > 30 ? 'rojo' : fila.diasResolucion > 15 ? 'naranja' : 'verde'}">${numeroDias(fila.diasResolucion)}</span></td>
              </tr>`
            )
            .join('') || '<tr><td colspan="5" class="celda-vacia">Sin resoluciones.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

/** Comparación lado a lado por municipio y por entidad. */
function renderComparativo(porMunicipio = [], porEstado = []) {
  const contenedor = $('statsComparativo');
  if (!contenedor) return;
  const tabla = (titulo, filas) => `
    <h5 class="u-fs-12px u-mayusculas u-mb-6">${esc(titulo)}</h5>
    <div class="u-scroll-x u-mb-12">
      <table class="data-table">
        <thead><tr><th>Territorio</th><th>Total</th><th>Resueltas</th><th>Tasa</th><th>Promedio</th><th>Críticas</th></tr></thead>
        <tbody>
          ${filas
            .map(
              (fila) => `<tr>
                <td><strong>${esc(fila.nombre)}</strong></td>
                <td>${fila.total}</td>
                <td>${fila.resueltas}</td>
                <td>${fila.tasaResolucion}%</td>
                <td>${numeroDias(fila.promedioResolucion)}</td>
                <td>${fila.criticas}</td>
              </tr>`
            )
            .join('') || '<tr><td colspan="6" class="celda-vacia">Sin datos para comparar.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  contenedor.innerHTML = tabla('Por municipio', porMunicipio) + tabla('Por estado', porEstado);
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
    cuerpo.innerHTML = `<tr><td colspan="7" class="celda-vacia u-p-20">${
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
          <td><code class="u-fs-105px">${esc(inc.id.slice(-6))}</code></td>
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

/** Oculta los roles de administrador cuando la sesión no es la maestra. */
export function limitarRolesAdmin(limitar = true) {
  const select = $('usuarioRol');
  if (!select) return;
  select.querySelectorAll('option').forEach((opcion) => {
    if (!['admin', 'admin_estatal', 'admin_municipal'].includes(opcion.value)) return;
    opcion.disabled = limitar;
    opcion.hidden = limitar;
  });
}

const normalizarBusqueda = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function filtroMunicipiosActivo() {
  return Boolean($('municipiosBuscar')?.value || $('municipiosEstado')?.value);
}

export function renderMunicipios(municipios = [], activoId) {
  // `aplicarMunicipio` vuelve a pintar con el catálogo simple; si ya hay un
  // resumen cargado se conserva para no borrar los conteos.
  if (municipios.some((m) => 'incidenciasAbiertas' in m)) {
    moduleState.resumenMunicipios = municipios;
  } else if (moduleState.resumenMunicipios) {
    municipios = moduleState.resumenMunicipios;
  }

  const selector = $('municipioSelect');
  if (selector) {
    selector.innerHTML = municipios
      .map(
        (m) =>
          `<option value="${esc(m.id)}" ${m.id === activoId ? 'selected' : ''}>${esc(m.nombre)}, ${esc(m.estado)}</option>`
      )
      .join('');
  }

  // Filtro por estado: se llena una sola vez y conserva la selección.
  const estados = [...new Set(municipios.map((m) => m.estado).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), 'es')
  );
  const filtroEstado = $('municipiosEstado');
  if (filtroEstado) {
    const actual = filtroEstado.value;
    filtroEstado.innerHTML =
      '<option value="">Todos los estados</option>' +
      estados.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join('');
    if (estados.includes(actual)) filtroEstado.value = actual;
    // Primera pintura: no mezclar entidades. El administrador puede volver a
    // «Todos los estados» cuando quiera comparar.
    if (!moduleState.filtroEstadoInicial && !actual && activoId) {
      const activo = municipios.find((m) => m.id === activoId);
      if (activo?.estado) filtroEstado.value = activo.estado;
      moduleState.filtroEstadoInicial = true;
    }
  }

  const texto = normalizarBusqueda($('municipiosBuscar')?.value);
  const estado = filtroEstado?.value || '';
  const visibles = municipios.filter(
    (m) =>
      (!estado || m.estado === estado) &&
      (!texto || normalizarBusqueda(`${m.nombre} ${m.estado}`).includes(texto))
  );

  const contenedor = $('municipiosLista');
  if (!contenedor) return;
  const porEstado = new Map();
  for (const m of visibles) {
    if (!porEstado.has(m.estado)) porEstado.set(m.estado, []);
    porEstado.get(m.estado).push(m);
  }

  contenedor.innerHTML = visibles.length
    ? `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead>
          <tr>
            <th>Municipio</th><th>Clave</th>
            <th title="Incidencias sin resolver">Incidencias</th>
            <th title="Tickets sin cerrar">Tickets</th>
            <th title="Sugerencias pendientes">Sugerencias</th>
            <th title="Personal asignado">Personal</th>
            <th>Ficha</th>
            <th>Ir a</th>
          </tr>
        </thead>
        <tbody>
          ${[...porEstado.entries()]
            .map(
              ([nombreEstado, lista]) => `
              <tr class="municipios-grupo"><td colspan="8">
                <i class="bi bi-geo-alt-fill"></i> ${esc(nombreEstado)} · ${lista.length} municipio(s)
              </td></tr>
              ${lista
                .map(
                  (m) => `
                <tr>
                  <td><strong>${esc(m.nombre)}</strong>${
                    m.id === activoId ? ' <span class="pastilla-activo">ACTIVO</span>' : ''
                  }</td>
                  <td>${m.clave ? `<code class="u-fs-11px">${esc(m.clave)}</code>` : '<span class="u-fs-11px u-suave">Oculta</span>'}</td>
                  <td><span class="inc-badge badge-${Number(m.incidenciasAbiertas) ? 'amarillo' : 'gris'}">${Number(m.incidenciasAbiertas) || 0}</span></td>
                  <td><span class="inc-badge badge-${Number(m.ticketsAbiertos) ? 'rojo' : 'gris'}">${Number(m.ticketsAbiertos) || 0}</span></td>
                  <td><span class="inc-badge badge-${Number(m.sugerenciasPendientes) ? 'verde' : 'gris'}">${Number(m.sugerenciasPendientes) || 0}</span></td>
                  <td><span class="inc-badge badge-gris">${Number(m.personal) || 0}</span></td>
                  <td>
                    <button class="btn btn-sm btn-outline" data-action="municipios:ficha" data-id="${esc(m.id)}" title="Ver o editar la información del municipio">
                      <i class="bi bi-card-list"></i>
                      <span class="u-fs-11px">${esc(
                        {
                          sin_ficha: 'Sin ficha',
                          borrador: 'Borrador',
                          pendiente: 'Por aprobar',
                          aprobado: 'Aprobada',
                          rechazado: 'Rechazada'
                        }[m.fichaEstado] || 'Sin ficha'
                      )}</span>
                    </button>
                  </td>
                  <td class="municipio-acciones">
                    <button class="btn btn-sm btn-outline" data-action="admin:irMunicipio" data-id="${esc(m.id)}" data-valor="incidencias" title="Ver incidencias de este municipio">
                      <i class="bi bi-list-ul"></i>
                    </button>
                    <button class="btn btn-sm btn-outline" data-action="admin:irMunicipio" data-id="${esc(m.id)}" data-valor="tickets" title="Ver tickets de este municipio">
                      <i class="bi bi-life-preserver"></i>
                    </button>
                    <button class="btn btn-sm btn-outline" data-action="admin:irClaves" data-id="${esc(m.id)}" title="Ver claves de acceso de este municipio">
                      <i class="bi bi-key-fill"></i>
                    </button>
                    <button class="btn btn-sm btn-outline" data-action="admin:irMunicipio" data-id="${esc(m.id)}" data-valor="usuarios" title="Ver personal de este municipio">
                      <i class="bi bi-people-fill"></i>
                    </button>
                  </td>
                </tr>`
                )
                .join('')}`
            )
            .join('')}
        </tbody>
      </table>
    </div>`
    : '<div class="empty-state"><i class="bi bi-search"></i><p>Ningún municipio coincide con la búsqueda.</p></div>';
}

export function renderListaRoles(roles = []) {
  const contenedor = $('rolesEspecialesLista');
  if (!contenedor) return;
  moduleState.rolesEspeciales = roles;
  if (!roles.length) {
    contenedor.innerHTML =
      '<p class="campo-nota">Aún no hay roles especiales. Crea el primero con el formulario de abajo.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Rol</th><th>Base</th><th>Permisos</th><th>Cuentas</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${roles
            .map(
              (r) => `<tr>
                <td><strong>${esc(r.nombre)}</strong><div class="campo-nota">${esc(r.descripcion || '')}</div></td>
                <td>${esc(r.rolBase)}</td>
                <td class="u-fs-11px">${esc((r.permisos || []).join(', '))}</td>
                <td>${r.cuentas ?? 0}</td>
                <td><span class="inc-badge badge-${r.activo ? 'verde' : 'gris'}">${r.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td class="u-acciones-tabla">
                  <button class="btn btn-outline btn-sm" data-action="roles:editar" data-id="${esc(r.id)}" title="Editar"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-danger btn-sm" data-action="roles:eliminar" data-id="${esc(r.id)}" title="Eliminar"><i class="bi bi-trash3"></i></button>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Pinta la matriz de permisos del formulario de roles. */
export function renderPermisosRol(permisos = []) {
  const contenedor = $('rolEspecialPermisos');
  if (!contenedor) return;
  const activos = new Set(permisos);
  contenedor.innerHTML = PERMISOS_LISTA.map(
    (permiso) =>
      `<label class="check-line"><input type="checkbox" data-permiso="${permiso}"${
        activos.has(permiso) ? ' checked' : ''
      }><span>${ETIQUETAS_PERMISO[permiso]}</span></label>`
  ).join('');
}

export function prepararFormRol(rol = null) {
  $('rolEspecialId').value = rol?.id || '';
  $('rolEspecialNombre').value = rol?.nombre || '';
  $('rolEspecialDescripcion').value = rol?.descripcion || '';
  $('rolEspecialBase').value = rol?.rolBase || 'funcionario';
  $('rolEspecialActivo').checked = rol ? rol.activo !== false : true;
  renderPermisosRol(rol?.permisos || []);
  $('rolEspecialFormTitulo').textContent = rol ? 'Editar rol' : 'Nuevo rol';
}

export function valoresRolForm() {
  return {
    id: $('rolEspecialId')?.value || null,
    nombre: $('rolEspecialNombre')?.value.trim() || '',
    descripcion: $('rolEspecialDescripcion')?.value.trim() || '',
    rolBase: $('rolEspecialBase')?.value || 'funcionario',
    activo: $('rolEspecialActivo')?.checked !== false,
    permisos: [...document.querySelectorAll('#rolEspecialPermisos input[data-permiso]')]
      .filter((c) => c.checked)
      .map((c) => c.dataset.permiso)
  };
}

export function rolPorId(id) {
  return (moduleState.rolesEspeciales || []).find((r) => r.id === id) || null;
}

export function renderSolicitudesPermisos(solicitudes = []) {
  const contenedor = $('solicitudesPermisosLista');
  if (!contenedor) return;
  if (!solicitudes.length) {
    contenedor.innerHTML =
      '<p class="campo-nota">No hay solicitudes de permisos pendientes ni recientes.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Cuenta</th><th>Permisos pedidos</th><th>Motivo</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
        <tbody>
          ${solicitudes
            .map(
              (s) => `<tr>
                <td><strong>${esc(s.nombre || s.username)}</strong><div class="campo-nota">${esc(s.username)}</div></td>
                <td class="u-fs-11px">${esc((s.permisos || []).join(', '))}</td>
                <td class="u-fs-11px">${esc(s.motivo)}${s.respuesta ? `<div class="campo-nota">Respuesta: ${esc(s.respuesta)}</div>` : ''}</td>
                <td><span class="inc-badge badge-${s.estado === 'aprobada' ? 'verde' : s.estado === 'rechazada' ? 'rojo' : 'amarillo'}">${esc(s.estado)}</span></td>
                <td class="u-fs-11px">${fmtFechaCorta(s.creadoEn)}</td>
                <td class="u-acciones-tabla">
                  ${s.estado === 'pendiente' ? `
                    <button class="btn btn-success btn-sm" data-action="permisos:aprobar" data-id="${esc(s.id)}" title="Aprobar"><i class="bi bi-check2"></i></button>
                    <button class="btn btn-danger btn-sm" data-action="permisos:rechazar" data-id="${esc(s.id)}" title="Rechazar"><i class="bi bi-x"></i></button>` : ''}
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

export function renderZonas(zonas = []) {
  const contenedor = $('zonasLista');
  if (!contenedor) return;
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Color</th><th>Zona</th><th>Tipo</th><th>Reportes</th><th>Pendientes</th><th>Resueltos</th></tr></thead>
        <tbody>
          ${
            zonas
              .map(
                (z) => `
            <tr>
              <td><span class="muestra-color" data-fondo="${esc(z.color)}"></span></td>
              <td>${esc(z.nombre)}</td>
              <td class="u-capitalizar">${esc(z.tipo)}</td>
              <td><strong>${z.reportes}</strong></td>
              <td>${z.pendientes}</td>
              <td>${z.resueltas}</td>
            </tr>`
              )
              .join('') ||
            '<tr><td colspan="6" class="celda-vacia u-p-20">Sin zonas definidas para este municipio</td></tr>'
          }
        </tbody>
      </table>
    </div>`;
  // El color de cada zona es un hex del catálogo: se aplica por CSSOM.
  aplicarEstilosDinamicos(contenedor);
}

export function renderUsuarios(
  usuarios = [],
  municipios = [],
  { esAdmin = false, puedeGestionar = esAdmin } = {}
) {
  const contenedor = $('usuariosLista');
  if (!contenedor) return;

  const botonNuevo = $('btnNuevoUsuario');
  if (botonNuevo) botonNuevo.style.display = puedeGestionar ? 'inline-flex' : 'none';

  if (!usuarios.length) {
    contenedor.innerHTML =
      '<div class="empty-state"><i class="bi bi-person-badge"></i><div>No hay cuentas del personal dadas de alta</div></div>';
    return;
  }

  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead>
          <tr>
            <th>Usuario</th><th>Nombre</th><th>Rol</th><th>Alcance</th><th>Escritura</th><th>Estado</th>
            ${puedeGestionar ? '<th>Acciones</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${usuarios
            .map((u) => {
              const asignados = (u.municipios && u.municipios.length
                ? u.municipios
                : u.municipioId
                  ? [u.municipioId]
                  : [])
                .map((id) => municipios.find((m) => m.id === id)?.nombre || id);
              const estados = u.estados || [];
              const alcance = [...asignados, ...estados.map((e) => `Estado: ${e}`)].join(', ');
              const color = u.rol === 'admin' ? 'rojo' : u.rol === 'funcionario' ? 'amarillo' : 'verde';
              return `
              <tr>
                <td><code>${esc(u.username)}</code></td>
                <td>${esc(u.nombre)}${u.correo ? `<div class="campo-nota">${esc(u.correo)}</div>` : ''}</td>
                <td><span class="inc-badge badge-${color}">${esc(u.rol)}</span>${
                  u.rolPersonalizado?.nombre
                    ? `<div class="campo-nota">★ ${esc(u.rolPersonalizado.nombre)}</div>`
                    : ''
                }</td>
                <td>${alcance ? esc(alcance) : '<span class="u-suave">Global</span>'}</td>
                <td>${u.puedeEscribir ? '✍️ Sí' : '👁️ Solo lectura'}</td>
                <td>${u.activo !== false ? '✅ Activa' : '🚫 Inactiva'}</td>
                ${
                  puedeGestionar
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
export function renderRolesEspeciales(roles = []) {
  moduleState.rolesEspeciales = roles;
  renderSelectRolEspecial();
}

/** Rellena el selector de rol especial según el rol base elegido. */
export function renderSelectRolEspecial(seleccionado = null) {
  const selector = $('usuarioRolEspecial');
  if (!selector) return;
  const rolBase = $('usuarioRol')?.value || 'funcionario';
  const actual = seleccionado ?? selector.value;
  const roles = (moduleState.rolesEspeciales || []).filter(
    (r) => r.activo !== false && r.rolBase === rolBase
  );
  selector.innerHTML =
    '<option value="">— Sin rol especial —</option>' +
    roles
      .map(
        (r) =>
          `<option value="${esc(r.id)}"${r.id === actual ? ' selected' : ''}>${esc(r.nombre)}</option>`
      )
      .join('');
  if (!roles.some((r) => r.id === actual)) selector.value = '';
}

export function prepararModalUsuario({ usuario = null, municipios = [], estados = [] } = {}) {
  const edicion = Boolean(usuario);

  $('modalUsuarioTitle').textContent = edicion ? 'Editar usuario' : 'Nuevo usuario';
  $('usuarioId').value = usuario?.id || '';
  $('usuarioUsernameBox').style.display = edicion ? 'none' : 'block';
  $('usuarioUsername').value = usuario?.username || '';
  $('usuarioNombre').value = usuario?.nombre || '';
  $('usuarioRol').value = usuario?.rol || 'funcionario';
  renderSelectRolEspecial(usuario?.rolPersonalizadoId || null);
  renderPermisos(usuario, usuario?.rol || 'funcionario');

  const asignados = usuario
    ? usuario.municipios && usuario.municipios.length
      ? usuario.municipios
      : usuario.municipioId
        ? [usuario.municipioId]
        : []
    : [];
  renderSelectMunicipiosUsuario(municipios, asignados, estados);
  renderSelectEstadosUsuario(municipios, usuario?.estados || [], estados);

  $('usuarioCorreo').value = usuario?.correo || '';
  $('usuarioPassword').value = '';
  $('usuarioPasswordNota').textContent = edicion
    ? 'Déjala vacía para conservar la contraseña actual.'
    : 'Mínimo 8 caracteres.';

  $('usuarioActivoBox').style.display = edicion ? 'block' : 'none';
  $('usuarioActivo').checked = usuario?.activo !== false;
  $('usuarioPuedeEscribir').checked =
    usuario?.puedeEscribir !== undefined
      ? usuario.puedeEscribir === true
      : (usuario?.rol || 'funcionario') === 'funcionario';

  // Clave de acceso: por defecto se ofrece al dar de alta (es el segundo factor
  // del login del personal) y queda apagada al editar, para no inundar de
  // códigos cuando solo se cambia, por ejemplo, el nombre.
  if ($('usuarioGenerarClave')) $('usuarioGenerarClave').checked = !edicion;
  if ($('usuarioClaveUsos')) $('usuarioClaveUsos').value = '';
  if ($('usuarioClaveExpira')) $('usuarioClaveExpira').value = '';

  actualizarNotaMunicipioUsuario();
}

/** Selectores territoriales activos del modal de usuario. */
const moduleState = {
  selectorMunicipios: null,
  selectorEstados: null,
  selectorClaveTerritorio: null,
  resumenMunicipios: null,
  rolesEspeciales: [],
  claves: [],
  filtroEstadoInicial: false
};

/** Rellena el selector de municipios del alta de usuarios. */
export function renderSelectMunicipiosUsuario(municipios = [], asignados = [], catalogoEstados = []) {
  moduleState.selectorMunicipios = crearSelectorTerritorial({
    contenedor: 'usuarioMunicipiosSelector',
    municipios,
    seleccionados: asignados,
    modo: 'municipios',
    catalogoEstados
  });
  return moduleState.selectorMunicipios;
}

/** Rellena el selector de estados del alta de usuarios. */
export function renderSelectEstadosUsuario(municipios = [], asignados = [], catalogoEstados = []) {
  moduleState.selectorEstados = crearSelectorTerritorial({
    contenedor: 'usuarioEstadosSelector',
    municipios,
    estados: asignados,
    modo: 'estados',
    catalogoEstados
  });
  return moduleState.selectorEstados;
}

/** Explica qué territorio exige cada rol y desactiva lo que no aplica. */
export function actualizarNotaMunicipioUsuario() {
  const rol = $('usuarioRol')?.value || 'funcionario';
  const nota = $('usuarioMunicipiosNota');
  const municipiosBox = $('usuarioMunicipiosBox');
  const estadosBox = $('usuarioEstadosBox');
  const escribirBox = $('usuarioPuedeEscribirBox');
  const escribir = $('usuarioPuedeEscribir');
  renderSelectRolEspecial();

  const usaEstados =
    rol === 'enlace_estatal' || rol === 'enlace_federal' || rol === 'admin_estatal' || rol === 'auditor';
  const usaMunicipios =
    rol === 'funcionario' || rol === 'auditor' || rol === 'soporte' || rol === 'admin_municipal' || rol === 'admin';

  if (nota) {
    nota.textContent =
      rol === 'funcionario'
        ? 'Obligatorio: el funcionario solo ve y gestiona estos municipios.'
        : rol === 'auditor'
          ? 'Puede asignarse por municipios o por estados (solo lectura).'
          : rol === 'admin'
            ? 'Opcional: sin municipios, el administrador maestro ve todo el país.'
            : rol === 'admin_municipal'
              ? 'Obligatorio: el administrador municipal solo gestiona estos municipios.'
              : rol === 'admin_estatal'
                ? 'Obligatorio: el administrador estatal gestiona todos los municipios de sus estados.'
                : rol === 'soporte'
                  ? 'Elige los municipios o estados cuyos tickets atenderá.'
                  : 'Selecciona los estados que podrá consultar (solo lectura).';
  }
  if (municipiosBox) municipiosBox.classList.toggle('u-oculto', !usaMunicipios);
  if (estadosBox) estadosBox.classList.toggle('u-oculto', !usaEstados);
  if (escribirBox) escribirBox.classList.toggle('u-oculto', !usaMunicipios);
  if (escribir && !usaMunicipios) escribir.checked = false;

  // La clave se genera con los municipios de la cuenta: no aplica a los
  // enlaces estatales/federales, que entran sin clave municipal.
  const claveBox = $('usuarioClaveBox');
  if (claveBox) claveBox.classList.toggle('u-oculto', !usaMunicipios);
}

export const PERMISOS_LISTA = [
  'reportar',
  'editar_propios',
  'cambiar_estado',
  'resolver',
  'moderar',
  'ver_moderacion',
  'exportar',
  'gestionar_usuarios',
  'ver_usuarios',
  'gestionar_claves',
  'ver_auditoria',
  'ver_incidencias_panel',
  'ver_tipos',
  'gestionar_tipos',
  'ver_municipios_panel',
  'ver_zonas',
  'gestionar_zonas',
  'ver_firmas',
  'ver_monitoreo',
  'responder_tickets',
  'atender_tickets',
  'configurar_notificaciones',
  'ver_metricas',
  'gestionar_solicitudes_informe',
  'gestionar_legal',
  'gestionar_configuracion',
  'gestionar_respaldos',
  'usar_simulador',
  'gestionar_publicidad',
  'gestionar_correos'
];

export const ETIQUETAS_PERMISO = {
  reportar: 'Reportar incidencias',
  editar_propios: 'Editar sus propios reportes',
  cambiar_estado: 'Cambiar estado',
  resolver: 'Resolver incidencias',
  moderar: 'Moderar contenido',
  ver_moderacion: 'Ver cola de moderación',
  exportar: 'Exportar informes',
  gestionar_usuarios: 'Gestionar usuarios',
  ver_usuarios: 'Ver usuarios',
  gestionar_claves: 'Gestionar claves',
  ver_auditoria: 'Ver bitácora de auditoría',
  ver_incidencias_panel: 'Ver pestaña de incidencias',
  ver_tipos: 'Ver tipos',
  gestionar_tipos: 'Gestionar tipos',
  ver_municipios_panel: 'Ver municipios y fichas',
  ver_zonas: 'Ver zonas',
  gestionar_zonas: 'Gestionar zonas',
  ver_firmas: 'Ver firmas y recolecciones',
  ver_monitoreo: 'Ver monitoreo y conectados',
  responder_tickets: 'Responder tickets',
  atender_tickets: 'Atender panel de soporte',
  configurar_notificaciones: 'Configurar notificaciones',
  ver_metricas: 'Ver estadísticas y métricas',
  gestionar_solicitudes_informe: 'Gestionar solicitudes de informe',
  gestionar_legal: 'Gestionar documentos legales',
  gestionar_configuracion: 'Gestionar configuración',
  gestionar_respaldos: 'Gestionar respaldos',
  usar_simulador: 'Usar simulador',
  gestionar_publicidad: 'Gestionar publicidad, QR y campañas',
  gestionar_correos: 'Gestionar correos institucionales'
};

const PERMISOS_BASE = {
  admin: PERMISOS_LISTA,
  admin_estatal: [
    'reportar', 'editar_propios', 'cambiar_estado', 'resolver', 'moderar', 'ver_moderacion',
    'exportar', 'gestionar_usuarios', 'ver_usuarios', 'gestionar_claves',
    'ver_incidencias_panel', 'ver_tipos', 'gestionar_tipos', 'ver_municipios_panel',
    'ver_zonas', 'gestionar_zonas', 'ver_firmas', 'ver_monitoreo', 'responder_tickets',
    'atender_tickets', 'configurar_notificaciones', 'ver_metricas'
  ],
  admin_municipal: [
    'reportar', 'editar_propios', 'cambiar_estado', 'resolver', 'moderar', 'ver_moderacion',
    'exportar', 'gestionar_usuarios', 'ver_usuarios', 'gestionar_claves',
    'ver_incidencias_panel', 'ver_tipos', 'gestionar_tipos', 'ver_municipios_panel',
    'ver_zonas', 'gestionar_zonas', 'ver_firmas', 'responder_tickets',
    'atender_tickets', 'configurar_notificaciones', 'ver_metricas'
  ],
  funcionario: [
    'reportar', 'editar_propios', 'cambiar_estado', 'resolver', 'moderar', 'ver_moderacion',
    'exportar', 'ver_usuarios', 'ver_incidencias_panel', 'ver_tipos', 'gestionar_tipos',
    'ver_municipios_panel', 'ver_zonas', 'gestionar_zonas', 'ver_firmas',
    'responder_tickets', 'configurar_notificaciones', 'ver_metricas'
  ],
  auditor: [
    'exportar', 'ver_usuarios', 'ver_incidencias_panel', 'ver_tipos',
    'ver_municipios_panel', 'ver_zonas', 'ver_moderacion', 'responder_tickets',
    'configurar_notificaciones', 'ver_metricas'
  ],
  soporte: [
    'responder_tickets', 'atender_tickets', 'ver_incidencias_panel',
    'ver_moderacion', 'configurar_notificaciones', 'ver_metricas'
  ],
  enlace_estatal: [
    'exportar', 'ver_incidencias_panel', 'ver_moderacion', 'responder_tickets',
    'configurar_notificaciones', 'ver_monitoreo', 'ver_metricas'
  ],
  enlace_federal: [
    'exportar', 'ver_incidencias_panel', 'ver_moderacion', 'responder_tickets',
    'configurar_notificaciones', 'ver_monitoreo', 'ver_metricas'
  ]
};

/** Pinta la matriz; `usuario.permisos` guarda solo las excepciones. */
export function renderPermisos(usuario, rol = 'funcionario') {
  const contenedor = $('usuarioPermisos');
  if (!contenedor) return;
  const base = new Set(PERMISOS_BASE[rol] || []);
  const overrides = usuario?.permisos || {};

  contenedor.innerHTML = PERMISOS_LISTA.map((permiso) => {
    const activo = overrides[permiso] !== undefined ? overrides[permiso] === true : base.has(permiso);
    return `<label class="check-line"><input type="checkbox" data-permiso="${permiso}"${activo ? ' checked' : ''}><span>${ETIQUETAS_PERMISO[permiso]}</span></label>`;
  }).join('');
}

function leerPermisos() {
  const salida = {};
  document.querySelectorAll('#usuarioPermisos input[data-permiso]').forEach((casilla) => {
    salida[casilla.dataset.permiso] = casilla.checked;
  });
  return salida;
}

export function valoresUsuarioForm() {
  const seleccion = (id) =>
    [...($(id)?.selectedOptions || [])].map((opcion) => opcion.value);
  const usos = $('usuarioClaveUsos')?.value || '';
  return {
    id: $('usuarioId').value.trim() || null,
    username: $('usuarioUsername').value.trim(),
    nombre: $('usuarioNombre').value.trim(),
    rol: $('usuarioRol').value,
    municipios: moduleState.selectorMunicipios?.municipios() ?? seleccion('usuarioMunicipios'),
    estados: moduleState.selectorEstados?.estados() ?? seleccion('usuarioEstados'),
    puedeEscribir: $('usuarioPuedeEscribir').checked,
    rolPersonalizadoId: $('usuarioRolEspecial')?.value || null,
    permisos: leerPermisos(),
    correo: $('usuarioCorreo').value.trim() || null,
    password: $('usuarioPassword').value,
    activo: $('usuarioActivo').checked,
    generarClave: $('usuarioGenerarClave')?.checked === true,
    claveUsosMaximos: usos ? Number(usos) : null,
    claveExpiraEn: $('usuarioClaveExpira')?.value || null
  };
}

export function valorMunicipioSeleccionado() {
  return $('municipioSelect')?.value || null;
}

export function valorBusqueda() {
  return $('adminBuscar')?.value || '';
}

/* --------------------------- claves de acceso --------------------------- */

function nombreMunicipio(municipios, id) {
  const encontrado = municipios.find((m) => String(m.id) === String(id));
  return encontrado ? encontrado.nombre : id;
}

export function clavesCargadas() {
  return moduleState.claves || [];
}

export function renderClaves(claves = [], municipios = []) {
  const contenedor = $('clavesLista');
  if (!contenedor) return;
  moduleState.claves = claves;
  const texto = normalizarBusqueda($('clavesBuscar')?.value);
  const visibles = texto
    ? claves.filter((c) =>
        normalizarBusqueda(
          `${c.nombre} ${c.codigo} ${(c.estados || []).join(' ')} ${(c.municipios || [])
            .map((id) => nombreMunicipio(municipios, id))
            .join(' ')} ${(c.usuariosVinculados || [])
            .map((u) => `${u.nombre || ''} ${u.username || ''}`)
            .join(' ')}`
        ).includes(texto)
      )
    : claves;
  if (!visibles.length) {
    contenedor.innerHTML =
      '<p class="u-fs-12px u-suave">Sin claves que coincidan. Puedes generar una al dar de alta o editar a una persona del personal, o desde este botón.</p>';
    return;
  }

  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Código</th><th>Nombre</th><th>Territorio</th><th>Usuarios vinculados</th><th>Sesiones</th><th>Usos</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${visibles
            .map((c) => {
              const vencida = c.expiraEn && new Date(c.expiraEn).getTime() <= Date.now();
              const agotada =
                c.usosMaximos !== null &&
                c.usosMaximos !== undefined &&
                Number(c.usos) >= Number(c.usosMaximos);
              const estado = !c.activa
                ? 'Revocada'
                : vencida
                  ? 'Vencida'
                  : agotada
                    ? 'Agotada'
                    : 'Activa';
              const badge = !c.activa || vencida || agotada ? 'rojo' : 'verde';
              const nombresMunicipios = (c.municipios || []).map((id) =>
                nombreMunicipio(municipios, id)
              );
              const territorio = (c.estados || []).length
                ? `${c.estados.join(', ')}${
                    nombresMunicipios.length
                      ? ` · ${nombresMunicipios.length} municipio(s)`
                      : ''
                  }`
                : nombresMunicipios.join(', ');
              const usuarios = (c.usuariosVinculados || []).map(
                (u) => u.nombre || u.username || '—'
              );
              const sesiones = Number(c.sesionesActivas) || 0;
              return `
            <tr>
              <td>
                <code class="u-fs-11px">${esc(c.codigo)}</code>
                <button class="btn btn-sm btn-outline" type="button"
                        data-action="claves:copiar" data-valor="${esc(c.codigo)}"
                        title="Copiar la clave" aria-label="Copiar la clave ${esc(c.codigo)}">
                  <i class="bi bi-clipboard"></i>
                </button>
              </td>
              <td>
                <strong>${esc(c.nombre)}</strong>
                <div class="campo-nota">${esc(c.rolSugerido || 'Sin rol sugerido')}</div>
              </td>
              <td class="u-fs-11px">${esc(territorio || '—')}</td>
              <td class="u-fs-11px">${
                usuarios.length ? esc(usuarios.join(', ')) : '<span class="u-suave">Sin usos</span>'
              }</td>
              <td>${
                sesiones
                  ? `<span class="inc-badge badge-verde">${sesiones} activa(s)</span>`
                  : '<span class="u-suave">Sin sesiones</span>'
              }</td>
              <td>${c.usos}${c.usosMaximos ? ` / ${c.usosMaximos}` : ''}</td>
              <td>${c.expiraEn ? fmtFechaCorta(c.expiraEn) : '—'}</td>
              <td><span class="inc-badge badge-${badge}">${estado}</span></td>
              <td class="u-nowrap">
                <button class="btn btn-sm btn-outline" data-action="claves:eliminar" data-id="${esc(c.id)}" title="Eliminar clave y cerrar sus sesiones">
                  <i class="bi bi-trash"></i> Eliminar
                </button>
              </td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/**
 * Muestra el código recién generado al guardar una cuenta. Solo se ve una vez:
 * en la base queda el código, pero el panel no lo repite al editar.
 */
export function mostrarClaveGenerada(clave = {}) {
  const codigo = $('claveGeneradaCodigo');
  if (codigo) codigo.textContent = clave.codigo || '—';
  const nota = $('claveGeneradaNota');
  if (nota) {
    const partes = [];
    if (clave.usosMaximos) partes.push(`Usos permitidos: ${clave.usosMaximos}.`);
    if (clave.expiraEn) partes.push(`Vence el ${fmtFechaCorta(clave.expiraEn)}.`);
    if (!partes.length) partes.push('Sin límite de usos ni vencimiento.');
    nota.textContent = partes.join(' ');
  }
}

/** Código que hay en el modal de clave generada (para copiarlo). */
export function claveGeneradaTexto() {
  return $('claveGeneradaCodigo')?.textContent?.trim() || '';
}

export function prepararModalClave(municipios = [], estados = []) {
  $('claveNombre').value = '';
  $('claveRol').value = 'funcionario';
  $('claveUsos').value = '';
  $('claveExpira').value = '';
  if (!moduleState.selectorClaveTerritorio) {
    moduleState.selectorClaveTerritorio = crearSelectorTerritorialPorEstado({
      contenedor: 'claveTerritorio',
      municipios,
      catalogoEstados: estados
    });
  } else {
    moduleState.selectorClaveTerritorio.limpiar();
  }
}

export function valoresClaveForm() {
  const municipios = moduleState.selectorClaveTerritorio?.municipios() || [];
  const estados = moduleState.selectorClaveTerritorio?.estados() || [];
  return {
    nombre: $('claveNombre').value.trim(),
    rolSugerido: $('claveRol').value,
    municipios,
    estados,
    usosMaximos: $('claveUsos').value ? Number($('claveUsos').value) : null,
    expiraEn: $('claveExpira').value || null
  };
}

/* ----------------------------- sesiones ----------------------------- */

export function renderSesiones(sesiones = []) {
  const contenedor = $('sesionesLista');
  if (!contenedor) return;
  if (!sesiones.length) {
    contenedor.innerHTML = '<p class="u-fs-12px u-suave">No hay sesiones activas.</p>';
    return;
  }

  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Cuenta</th><th>Rol</th><th>Clave de acceso</th><th>Municipio</th><th>Inicio</th><th>Última actividad</th><th>Huella IP</th><th></th></tr></thead>
        <tbody>
          ${sesiones
            .map(
              (s) => `
            <tr>
              <td class="u-fs-12px">${esc(s.userKey || '—')}</td>
              <td><span class="inc-badge badge-${s.rol === 'admin' ? 'rojo' : 'amarillo'}">${esc(s.rol || '—')}</span></td>
              <td class="u-fs-11px">${
                s.claveCodigo
                  ? `<code>${esc(s.claveCodigo)}</code>${
                      s.claveNombre ? `<div class="campo-nota">${esc(s.claveNombre)}</div>` : ''
                    }`
                  : '<span class="u-suave">Sin clave</span>'
              }</td>
              <td class="u-fs-11px">${esc(s.municipioId || '—')}</td>
              <td class="u-fs-11px">${fmtFechaCorta(s.inicio)}</td>
              <td class="u-fs-11px">${fmtFechaCorta(s.ultimaActividad)}</td>
              <td class="u-fs-11px">${esc((s.ipHash || '').slice(0, 12) || '—')}</td>
              <td><button class="btn btn-sm btn-outline" data-action="sesiones:revocar" data-id="${esc(s.id)}">Revocar</button></td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/* ------------------------------ auditoría ------------------------------ */

function fechaHora(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? '—'
    : fecha.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

/** Resume el detalle de auditoría: permisos del actor y cuerpo saneado. */
function detalleAuditoria(valor) {
  if (!valor) return '';
  try {
    const datos = typeof valor === 'string' ? JSON.parse(valor) : valor;
    const partes = [];
    if (Array.isArray(datos?.permisos) && datos.permisos.length) {
      partes.push(`Permisos: ${datos.permisos.join(', ')}`);
    }
    const cuerpo = datos?.body;
    if (cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo)) {
      const campos = Object.keys(cuerpo)
        .filter((clave) => !['password', 'claveAcceso', 'token'].includes(clave))
        .slice(0, 4);
      if (campos.length) {
        partes.push(
          campos
            .map((clave) => `${clave}=${String(cuerpo[clave] ?? '').slice(0, 40)}`)
            .join(' · ')
        );
      }
    }
    return partes.join(' · ') || String(valor).slice(0, 120);
  } catch {
    return String(valor).slice(0, 120);
  }
}

export function renderAuditoria(registros = []) {
  const contenedor = $('auditoriaLista');
  if (!contenedor) return;
  if (!registros.length) {
    contenedor.innerHTML =
      '<p class="u-fs-12px u-suave">No hay acciones registradas con esos filtros.</p>';
    return;
  }

  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Entidad</th><th>Resultado</th><th>Clave</th><th>Huella IP</th></tr></thead>
        <tbody>
          ${registros
            .map(
              (r) => `
            <tr>
              <td class="u-fs-11px u-nowrap">${esc(fechaHora(r.creadoEn))}</td>
              <td class="u-fs-11px">
                <strong>${esc(r.username || r.userKey || '—')}</strong>
                <div class="campo-nota">${esc(r.rol || 'sin rol')}</div>
              </td>
              <td class="u-fs-11px">
                <code>${esc(r.accion || r.ruta || '—')}</code>
                ${r.detalle ? `<div class="campo-nota">${esc(detalleAuditoria(r.detalle).slice(0, 160))}</div>` : ''}
              </td>
              <td class="u-fs-11px">${esc(r.entidad || '—')}${r.entidadId ? ` · ${esc(r.entidadId)}` : ''}</td>
              <td><span class="inc-badge badge-${r.estadoHttp && r.estadoHttp < 400 ? 'verde' : 'rojo'}">${esc(r.estadoHttp || '—')}</span></td>
              <td class="u-fs-11px">${esc(r.claveCodigo || r.claveId || '—')}${r.claveNombre ? `<div class="campo-nota">${esc(r.claveNombre)}</div>` : ''}</td>
              <td class="u-fs-11px">${esc((r.ipHash || '').slice(0, 12) || '—')}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/* ------------------------------ moderación ------------------------------ */

/** Etiquetas del expediente de una denuncia. */
const ESTADO_DENUNCIA = {
  pendiente: 'Pendiente',
  atendida: 'Atendida',
  descartada: 'Descartada'
};

/**
 * Pestaña de moderación: contadores, cola de denuncias agrupadas por contenido,
 * publicaciones ocultas y cuentas advertidas o suspendidas.
 */
export function renderModeracion({
  grupos = [],
  resumen = null,
  sanciones = [],
  ocultas = [],
  tipos = [],
  motivos = {},
  puedeEliminar = false
} = {}) {
  renderContadoresModeracion(resumen);
  renderColaDenuncias(grupos, { motivos, puedeEliminar });
  renderOcultas(ocultas, { tipos });
  renderSanciones(sanciones);
}

function renderContadoresModeracion(resumen) {
  const contenedor = $('moderacionResumen');
  if (!contenedor) return;
  if (!resumen) {
    contenedor.innerHTML = '';
    return;
  }
  contenedor.innerHTML = `
    <div class="stat-card ${resumen.pendientes ? 'rojo' : ''}"><div class="stat-num">${resumen.pendientes}</div><div class="stat-label">🚩 Denuncias pendientes</div></div>
    <div class="stat-card naranja"><div class="stat-num">${resumen.ocultas}</div><div class="stat-label">🚫 Publicaciones ocultas</div></div>
    <div class="stat-card amarillo"><div class="stat-num">${resumen.advertidas}</div><div class="stat-label">⚠️ Cuentas advertidas</div></div>
    <div class="stat-card"><div class="stat-num">${resumen.suspendidas}</div><div class="stat-label">⛔ Cuentas suspendidas</div></div>
  `;
}

/** Chips con los motivos que se repiten en un grupo de denuncias. */
function motivosHTML(grupo, motivos) {
  return (grupo.motivos || [])
    .map((m) => `<span class="chip-motivo">${esc(motivos[m] || m)}</span>`)
    .join('');
}

function renderColaDenuncias(grupos, { motivos = {}, puedeEliminar = false } = {}) {
  const contenedor = $('denunciasLista');
  if (!contenedor) return;

  if (!grupos.length) {
    contenedor.innerHTML =
      '<div class="moderacion-vacio"><i class="bi bi-shield-check"></i> No hay denuncias pendientes. ¡Buen trabajo!</div>';
    return;
  }

  contenedor.innerHTML = grupos
    .map((grupo) => {
      const primera = grupo.denuncias[0] || {};
      const estado = grupo.objetivo_estado || {};
      const etiquetaObjetivo = grupo.objetivo === 'comentario' ? 'Comentario' : 'Reporte';
      const avisos = [
        estado.eliminada ? '<span class="chip-aviso rojo">Contenido eliminado</span>' : '',
        !estado.eliminada && estado.oculto ? '<span class="chip-aviso naranja">Ya está oculto</span>' : '',
        estado.estado ? `<span class="chip-aviso">${esc(etiquetaEstado(estado.estado))}</span>` : ''
      ]
        .filter(Boolean)
        .join('');

      const denunciantes = grupo.denuncias
        .map(
          (d) => `
          <li>
            <strong>${esc(d.autorNombre)}</strong> · ${esc(motivos[d.motivo] || d.motivo)}
            ${d.detalle ? `<div class="denuncia-detalle">“${esc(d.detalle)}”</div>` : ''}
            <span class="denuncia-fecha">${fmtFechaCorta(d.fecha)}</span>
          </li>`
        )
        .join('');

      return `
      <article class="moderacion-card ${estado.oculto ? 'ya-oculta' : ''}">
        <header>
          <div class="moderacion-card-titulo">
            <span class="chip-objetivo">${etiquetaObjetivo}</span>
            <h4>${esc(grupo.objetivoTitulo)}</h4>
          </div>
          <span class="moderacion-contador">${grupo.total} ${grupo.total === 1 ? 'denuncia' : 'denuncias'}</span>
        </header>
        ${
          grupo.objetivoResumen
            ? `<p class="moderacion-resumen">“${esc(grupo.objetivoResumen)}”</p>`
            : ''
        }
        <div class="moderacion-meta">
          <span><i class="bi bi-person-fill"></i> ${esc(grupo.objetivoAutor || 'Anónimo')}</span>
          <span><i class="bi bi-clock-history"></i> ${fmtFechaCorta(grupo.ultimaFecha)}</span>
          ${avisos}
        </div>
        <div class="moderacion-motivos">${motivosHTML(grupo, motivos)}</div>
        <details class="moderacion-detalle">
          <summary>Ver las ${grupo.total} ${grupo.total === 1 ? 'denuncia' : 'denuncias'}</summary>
          <ul class="denuncia-lista">${denunciantes}</ul>
        </details>
        <div class="moderacion-acciones">
          <button class="btn btn-sm btn-outline" data-action="moderacion:ver" data-id="${esc(grupo.incidenciaId)}">
            <i class="bi bi-eye"></i> Ver publicación
          </button>
          <button class="btn btn-sm btn-outline" data-action="moderacion:decidir" data-id="${esc(primera.id)}" data-valor="descartar">
            <i class="bi bi-check2"></i> Descartar
          </button>
          ${
            estado.oculto || estado.eliminada
              ? ''
              : `<button class="btn btn-sm btn-danger" data-action="moderacion:decidir" data-id="${esc(primera.id)}" data-valor="ocultar">
                   <i class="bi bi-eye-slash-fill"></i> Ocultar
                 </button>`
          }
          <button class="btn btn-sm btn-warning" data-action="moderacion:decidir" data-id="${esc(primera.id)}" data-valor="advertir">
            <i class="bi bi-exclamation-triangle-fill"></i> Advertir
          </button>
          <button class="btn btn-sm btn-danger" data-action="moderacion:decidir" data-id="${esc(primera.id)}" data-valor="suspender">
            <i class="bi bi-slash-circle-fill"></i> Suspender
          </button>
          ${
            puedeEliminar && !estado.eliminada
              ? `<button class="btn btn-sm btn-danger" data-action="moderacion:decidir" data-id="${esc(primera.id)}" data-valor="eliminar">
                   <i class="bi bi-trash3-fill"></i> Eliminar
                 </button>`
              : ''
          }
        </div>
      </article>`;
    })
    .join('');
}

/** Publicaciones retiradas por moderación, con su motivo y su autor. */
function renderOcultas(ocultas, { tipos = [] } = {}) {
  const contenedor = $('ocultasLista');
  if (!contenedor) return;

  if (!ocultas.length) {
    contenedor.innerHTML =
      '<div class="moderacion-vacio"><i class="bi bi-eye"></i> No hay publicaciones ocultas en este municipio.</div>';
    return;
  }

  contenedor.innerHTML = ocultas
    .map((inc) => {
      const tipo = tipos.find((t) => t.id === inc.tipoId);
      return `
      <article class="moderacion-card ya-oculta">
        <header>
          <div class="moderacion-card-titulo">
            <span class="chip-objetivo">${esc(tipo ? tipo.icono + ' ' + tipo.nombre : 'Reporte')}</span>
            <h4>${esc(inc.titulo)}</h4>
          </div>
          <span class="moderacion-contador">${esc(inc.etiquetaEstado || '')}</span>
        </header>
        <div class="moderacion-meta">
          <span><i class="bi bi-person-fill"></i> ${esc(inc.esAnonimo ? 'Anónimo' : inc.autorNombre || '—')}</span>
          <span><i class="bi bi-eye-slash-fill"></i> ${esc(inc.ocultaPor || 'moderación')}${
            inc.ocultaFecha ? ` · ${fmtFechaCorta(inc.ocultaFecha)}` : ''
          }</span>
        </div>
        ${inc.ocultaMotivo ? `<div class="peligro-motivo"><strong>Motivo:</strong> ${esc(inc.ocultaMotivo)}</div>` : ''}
        <div class="moderacion-acciones">
          <button class="btn btn-sm btn-outline" data-action="moderacion:ver" data-id="${esc(inc.id)}">
            <i class="bi bi-eye"></i> Ver publicación
          </button>
          <button class="btn btn-sm btn-success" data-action="moderacion:ocultar" data-id="${esc(inc.id)}" data-valor="mostrar">
            <i class="bi bi-eye-fill"></i> Volver a mostrar
          </button>
        </div>
      </article>`;
    })
    .join('');
}

/** Cuentas advertidas o suspendidas que el moderador puede gestionar. */
function renderSanciones(sanciones = []) {
  const cuerpo = $('sancionesBody');
  if (!cuerpo) return;

  if (!sanciones.length) {
    cuerpo.innerHTML =
      '<tr><td colspan="6" class="celda-vacia u-p-18">No hay cuentas advertidas, suspendidas o con comentarios restringidos</td></tr>';
    return;
  }

  cuerpo.innerHTML = sanciones
    .map((cuenta) => {
      const estado = cuenta.suspendido
        ? `<span class="chip-aviso rojo">Suspendida${
            cuenta.suspendidoHasta ? ' hasta ' + fmtFechaCorta(cuenta.suspendidoHasta) : ' (indefinida)'
          }</span>`
        : '<span class="chip-aviso">Activa</span>';
      const restriccion = cuenta.restriccionComentarios;
      const comentarios = restriccion
        ? `<span class="chip-aviso rojo">Restringidos${
            restriccion.hasta ? ' hasta ' + fmtFechaCorta(restriccion.hasta) : ' (indefinido)'
          }</span>
           ${restriccion.motivo ? `<div class="campo-nota">${esc(restriccion.motivo)}</div>` : ''}`
        : '<span class="chip-aviso">Sin restricción</span>';
      return `
      <tr class="${cuenta.suspendido ? 'fila-oculta' : ''}">
        <td>${esc(cuenta.nombre)}</td>
        <td><code>${esc(cuenta.username)}</code></td>
        <td>${cuenta.advertencias || 0}</td>
        <td>${estado}</td>
        <td>${comentarios}</td>
        <td class="u-derecha u-acciones-tabla">
          ${
            restriccion
              ? `<button class="btn btn-sm btn-success" data-action="moderacion:levantarRestriccion" data-id="${esc(cuenta.username)}">
                   <i class="bi bi-chat-dots"></i> Levantar restricción
                 </button>`
              : `<button class="btn btn-sm btn-outline" data-action="moderacion:restringirComentarios" data-id="${esc(cuenta.username)}">
                   <i class="bi bi-chat-square-text"></i> Restringir comentarios
                 </button>`
          }
          ${
            cuenta.suspendido
              ? `<button class="btn btn-sm btn-success" data-action="moderacion:reactivar" data-id="${esc(cuenta.username)}">
                   <i class="bi bi-arrow-counterclockwise"></i> Reactivar
                 </button>`
              : `<button class="btn btn-sm btn-danger" data-action="moderacion:suspender" data-id="${esc(cuenta.username)}">
                   <i class="bi bi-slash-circle-fill"></i> Suspender
                 </button>`
          }
        </td>
      </tr>`;
    })
    .join('');
}

/* ------------------------- solicitudes de acceso ------------------------ */

export function renderSolicitudesAcceso(solicitudes = []) {
  const contenedor = $('solicitudesAccesoLista');
  if (!contenedor) return;
  if (!solicitudes.length) {
    contenedor.innerHTML = '<p class="u-fs-12px u-suave">No hay solicitudes pendientes.</p>';
    return;
  }

  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Folio</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Municipios</th><th>Acciones</th></tr></thead>
        <tbody>
          ${solicitudes
            .map(
              (s) => `
            <tr>
              <td class="u-fs-11px">${esc(s.folio)}</td>
              <td>${esc(s.nombre)}</td>
              <td class="u-fs-11px">${esc(s.correo)}</td>
              <td><span class="inc-badge badge-amarillo">${esc(s.rolSolicitado)}</span></td>
              <td class="u-fs-11px">${esc((s.municipios || []).join(', ') || '—')}</td>
              <td class="u-fila-env">
                <button class="btn btn-sm btn-primary" data-action="solicitudes:aprobar" data-id="${esc(s.id)}">Aprobar</button>
                <button class="btn btn-sm btn-outline" data-action="solicitudes:rechazar" data-id="${esc(s.id)}">Rechazar</button>
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/* ------------------------------- tickets -------------------------------- */

export function renderTicketsAdmin(tickets = []) {
  const contenedor = $('ticketsAdminLista');
  if (!contenedor) return;
  if (!tickets.length) {
    contenedor.innerHTML = '<p class="u-fs-12px u-suave">No hay tickets registrados.</p>';
    return;
  }

  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Folio</th><th>Asunto</th><th>Autor</th><th>Responsable</th><th>Categoría</th><th>Prioridad</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${tickets
            .map(
              (t) => `
            <tr>
              <td class="u-fs-11px">${esc(t.folio)}</td>
              <td>${esc(t.asunto)}</td>
              <td class="u-fs-11px">${esc(t.autorUserKey || '—')}</td>
              <td class="u-fs-11px">${t.asignadoA ? esc(t.asignadoA) : '<span class="u-suave">Sin asignar</span>'}</td>
              <td class="u-fs-11px">${esc(t.categoria)}</td>
              <td><span class="inc-badge badge-${t.prioridad === 'alta' ? 'rojo' : t.prioridad === 'media' ? 'amarillo' : 'verde'}">${esc(t.prioridad)}</span></td>
              <td class="u-fs-11px">${esc(t.estado)}</td>
              <td><button class="btn btn-sm btn-outline" data-action="tickets:ver" data-id="${esc(t.id)}">Abrir</button></td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

export function renderTicketAdmin(ticket) {
  $('ticketAdminTitulo').textContent = `${ticket.folio} · ${ticket.asunto}`;
  const hilo = (ticket.mensajes || [])
    .map(
      (m) => `
      <div class="panel-blanco u-mb-6">
        <div class="u-fs-11px u-suave">${esc(m.autorUserKey || 'sistema')} · ${fmtFechaCorta(m.creadoEn)}</div>
        <div class="u-fs-12px u-mt-4">${esc(m.cuerpo)}</div>
      </div>`
    )
    .join('');

  $('ticketAdminDetalle').innerHTML = `
    <p class="u-fs-12px u-gris">${esc(ticket.cuerpo)}</p>
    <p class="u-fs-11px u-suave u-mt-8">
      Autor: ${esc(ticket.autorUserKey)} · Estado: ${esc(ticket.estado)} · Prioridad: ${esc(ticket.prioridad)}
    </p>
    <div class="u-mt-10">${hilo || '<p class="u-fs-11px u-suave">Sin respuestas todavía.</p>'}</div>`;
  const prioridad = $('ticketAdminPrioridad');
  if (prioridad) prioridad.value = ticket.prioridad || 'media';
  $('ticketAdminRespuesta').value = '';
  $('ticketAdminCerrarBtn').disabled = ticket.estado === 'cerrado';
}

export function ticketAdminId() {
  return $('ticketAdminDetalle')?.dataset.ticketId || null;
}

export function fijarTicketAdminId(id) {
  const detalle = $('ticketAdminDetalle');
  if (detalle) detalle.dataset.ticketId = id || '';
}

/* -------------------- configuración de notificaciones -------------------- */

const ETIQUETAS_CANAL = {
  app: 'Campana',
  correo: 'Solo correo',
  ambos: 'Campana y correo',
  ninguno: 'Silenciado'
};

/** Matriz evento × canal × roles × alcance del panel de administración. */
export function renderConfigNotificaciones(eventos = [], municipios = []) {
  const contenedor = $('notifAdminLista');
  if (!contenedor) return;

  if (!eventos.length) {
    contenedor.innerHTML = '<p class="u-fs-12px u-suave">Sin eventos de notificación.</p>';
    return;
  }

  const estados = [...new Set(municipios.map((m) => m.estado))]
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), 'es'));

  contenedor.innerHTML = eventos
    .map((evento) => {
      const roles = Array.isArray(evento.roles) ? evento.roles : [];
      const seleccionMunicipios = new Set(evento.municipios || []);
      const seleccionEstados = new Set(evento.estados || []);
      return `
      <div class="notif-admin-card" data-evento="${esc(evento.evento)}">
        <div class="u-fila-sep">
          <div>
            <strong>${esc(evento.etiqueta || evento.evento)}</strong>
            <div class="campo-nota">${esc(evento.descripcion || '')}</div>
          </div>
          <label class="check-line">
            <input type="checkbox" class="notif-admin-activo"${evento.activo !== false ? ' checked' : ''}>
            <span>Activo</span>
          </label>
        </div>
        <div class="filter-row u-mt-8">
          <div class="form-group">
            <label>Canal</label>
            <select class="notif-admin-canal">
              ${['app', 'correo', 'ambos', 'ninguno']
                .map(
                  (canal) =>
                    `<option value="${canal}"${(evento.canal || 'app') === canal ? ' selected' : ''}>${ETIQUETAS_CANAL[canal]}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Alcance</label>
            <select class="notif-admin-alcance">
              ${['asignados', 'municipios', 'estados', 'todos']
                .map(
                  (alcance) =>
                    `<option value="${alcance}"${(evento.alcance || 'asignados') === alcance ? ' selected' : ''}>${alcance}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Roles destinatarios</label>
            <select class="select-multiple notif-admin-roles" multiple size="4">
              ${(evento.rolesDisponibles || [])
                .map(
                  (rol) =>
                    `<option value="${esc(rol)}"${roles.includes(rol) ? ' selected' : ''}>${esc(rol)}</option>`
                )
                .join('')}
            </select>
          </div>
        </div>
        <div class="filter-row notif-admin-territorio u-oculto">
          <div class="form-group notif-admin-municipios-box">
            <label>Municipios</label>
            <select class="select-multiple notif-admin-municipios" multiple size="4">
              ${municipios
                .map(
                  (m) =>
                    `<option value="${esc(m.id)}"${seleccionMunicipios.has(m.id) ? ' selected' : ''}>${esc(m.nombre)}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="form-group notif-admin-estados-box">
            <label>Estados</label>
            <select class="select-multiple notif-admin-estados" multiple size="4">
              ${estados
                .map(
                  (estado) =>
                    `<option value="${esc(estado)}"${seleccionEstados.has(estado) ? ' selected' : ''}>${esc(estado)}</option>`
                )
                .join('')}
            </select>
          </div>
        </div>
        <div class="u-fila-env u-mt-8">
          <button class="btn btn-primary btn-sm" data-action="notificacionesAdmin:guardar" data-id="${esc(evento.evento)}">
            <i class="bi bi-check2-circle"></i> Guardar
          </button>
        </div>
      </div>`;
    })
    .join('');

  contenedor.querySelectorAll('.notif-admin-card').forEach((tarjeta) => {
    const alcance = tarjeta.querySelector('.notif-admin-alcance');
    const alternar = () => {
      const valor = alcance?.value;
      tarjeta.querySelector('.notif-admin-territorio')?.classList.toggle('u-oculto', !valor || valor === 'todos' || valor === 'asignados');
      tarjeta.querySelector('.notif-admin-municipios-box')?.classList.toggle('u-oculto', valor !== 'municipios');
      tarjeta.querySelector('.notif-admin-estados-box')?.classList.toggle('u-oculto', valor !== 'estados');
    };
    alcance?.addEventListener('change', alternar);
    alternar();
  });
}

/** Lee la tarjeta de un evento para guardarla. */
export function valoresConfigNotificacion(evento) {
  const tarjeta = document.querySelector(`.notif-admin-card[data-evento="${evento}"]`);
  if (!tarjeta) return null;
  const seleccion = (selector) =>
    [...(tarjeta.querySelector(selector)?.selectedOptions || [])].map((o) => o.value);
  return {
    activo: tarjeta.querySelector('.notif-admin-activo')?.checked === true,
    canal: tarjeta.querySelector('.notif-admin-canal')?.value || 'app',
    alcance: tarjeta.querySelector('.notif-admin-alcance')?.value || 'asignados',
    roles: seleccion('.notif-admin-roles'),
    municipios: seleccion('.notif-admin-municipios'),
    estados: seleccion('.notif-admin-estados')
  };
}

/* -------------------- reglas de asignación de tickets -------------------- */

const NOMBRE_ROL = {
  soporte: 'Soporte',
  funcionario: 'Funcionarios',
  auditor: 'Auditores',
  admin: 'Administradores',
  admin_municipal: 'Administradores municipales',
  admin_estatal: 'Administradores estatales',
  enlace_estatal: 'Enlaces estatales',
  enlace_federal: 'Enlaces federales'
};

const ROLES_CON_ATENCION = ['soporte', 'admin_municipal', 'admin_estatal', 'admin'];

/** Rellena los selectores del formulario de reglas (panel Tickets). */
export function prepararFormRegla(municipios = [], staff = []) {
  const municipio = $('reglaMunicipio');
  if (municipio) {
    municipio.innerHTML =
      '<option value="">Cualquiera</option>' +
      municipios
        .map((m) => `<option value="${esc(m.id)}">${esc(m.nombre)}</option>`)
        .join('');
  }
  const responsable = $('reglaResponsable');
  if (responsable) {
    responsable.innerHTML =
      '<option value="">— Elegir —</option>' +
      staff
        .filter((u) => ROLES_CON_ATENCION.includes(u.rol))
        .map(
          (u) => `<option value="${esc(u.username)}">${esc(u.nombre)} (${esc(u.rol)})</option>`
        )
        .join('');
  }
}

export function valoresRegla() {
  return {
    municipioId: $('reglaMunicipio')?.value || null,
    prioridad: $('reglaPrioridad')?.value || null,
    asignarA: $('reglaResponsable')?.value || null,
    asignarRol: $('reglaRol')?.value || null
  };
}

export function renderReglaSimulada(datos = {}, municipios = [], staff = []) {
  const contenedor = $('reglasSimulacion');
  if (!contenedor) return;
  const municipio = datos.municipioId
    ? municipios.find((m) => m.id === datos.municipioId)?.nombre || datos.municipioId
    : 'Cualquiera';
  const responsable = datos.asignarA
    ? staff.find((u) => u.username === datos.asignarA)?.nombre || datos.asignarA
    : datos.asignarRol
      ? `Cola: ${NOMBRE_ROL[datos.asignarRol] || datos.asignarRol}`
      : 'Sin destino';
  contenedor.textContent =
    `Simulación (no guardada): municipio ${municipio} · prioridad ${datos.prioridad || 'cualquiera'} · ${responsable}. ` +
    'Pulsa «Crear regla» para guardarla de verdad.';
  contenedor.classList.remove('u-oculto');
}

export function limpiarReglaSimulada() {
  const contenedor = $('reglasSimulacion');
  if (!contenedor) return;
  contenedor.textContent = '';
  contenedor.classList.add('u-oculto');
}

export function renderReglasTickets(reglas = [], municipios = [], staff = []) {
  const contenedor = $('reglasTicketsLista');
  if (!contenedor) return;
  if (!reglas.length) {
    contenedor.innerHTML = '<p class="u-fs-12px u-suave">Sin reglas: los tickets quedan en cola.</p>';
    return;
  }

  const nombreMunicipio = (id) => municipios.find((m) => m.id === id)?.nombre || id;
  const nombrePersona = (username) => staff.find((u) => u.username === username)?.nombre || username;

  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Municipio</th><th>Prioridad</th><th>Asignar a</th><th></th></tr></thead>
        <tbody>
          ${reglas
            .map(
              (r) => `
            <tr>
              <td class="u-fs-12px">${r.municipioId ? esc(nombreMunicipio(r.municipioId)) : 'Cualquiera'}</td>
              <td class="u-fs-12px">${r.prioridad ? esc(r.prioridad) : 'Cualquiera'}</td>
              <td class="u-fs-12px">${
                r.asignarA
                  ? esc(nombrePersona(r.asignarA))
                  : `Cola: ${esc(NOMBRE_ROL[r.asignarRol] || r.asignarRol || '—')}`
              }</td>
              <td>
                <button class="btn btn-sm btn-outline" data-action="reglas:eliminar" data-id="${esc(r.id)}">
                  <i class="bi bi-trash"></i>
                </button>
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

