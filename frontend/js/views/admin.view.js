/** Vista del panel de administración (6 pestañas). */
import { $, esc, textoAntiguedad, etiquetaEstado, fmtFechaCorta, aplicarEstilosDinamicos } from '../core/utils.js';
import { urlPrivada } from '../core/api.js';
import { crearSelectorTerritorial } from '../core/selector-territorial.js';
import { crearSelectorTerritorialPorEstado } from '../core/selector-territorial-bloques.js';
import { renderListaTipos } from './tipos.view.js';
import {
  ACCIONES_CRUD,
  ETIQUETAS_PERMISO,
  GRUPOS_PERMISOS,
  PERMISOS_CRUD,
  PERMISOS_LISTA,
  expandirPermisos,
  permisosBaseDeRol,
  permisosEfectivosDeRol
} from '../data/permisos.js';
import { PERMISOS_AYUDA } from '../data/permisos-ayuda.js';
import { store } from '../core/store.js';

export { ETIQUETAS_PERMISO, PERMISOS_LISTA };

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

/**
 * @param {Array} municipios resumen por municipio.
 * @param {string} activoId municipio activo.
 * @param {Object} opciones
 * @param {boolean} opciones.municipal la sesión solo gestiona sus municipios:
 *   sin selector de municipio, sin filtro por estado y sin el grupo de entidad.
 */
export function renderMunicipios(municipios = [], activoId, opciones = {}) {
  // Un funcionario de un solo municipio no debe ver los controles nacionales.
  const municipal =
    opciones.municipal ??
    (store.estado.alcance?.modo === 'municipios' && (municipios || []).length <= 1);

  // `aplicarMunicipio` vuelve a pintar con el catálogo simple; si ya hay un
  // resumen cargado se conserva para no borrar los conteos.
  if (municipios.some((m) => 'incidenciasAbiertas' in m)) {
    moduleState.resumenMunicipios = municipios;
  } else if (moduleState.resumenMunicipios) {
    municipios = moduleState.resumenMunicipios;
  }
  if (municipal) {
    // Un funcionario de un solo municipio no debe poder cambiar de municipio
    // desde aquí: se queda con el suyo aunque el resumen traiga más.
    const propio = String(activoId || municipios[0]?.id || '');
    const soloElPropio = municipios.filter((m) => String(m.id) === propio);
    if (soloElPropio.length) municipios = soloElPropio;
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
  const estado = municipal ? '' : filtroEstado?.value || '';
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
    ${
      municipal
        ? `<p class="campo-nota u-mb-8">
            Esta es la ficha de tu municipio. Actualiza sus datos con el botón «Ficha»;
            el cambio queda pendiente de aprobación de la administración.
          </p>`
        : ''
    }
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
            ${municipal ? '' : '<th>Ir a</th>'}
          </tr>
        </thead>
        <tbody>
          ${[...porEstado.entries()]
            .map(
              ([nombreEstado, lista]) => `
              ${
                municipal
                  ? ''
                  : `<tr class="municipios-grupo"><td colspan="8">
                <i class="bi bi-geo-alt-fill"></i> ${esc(nombreEstado)} · ${lista.length} municipio(s)
              </td></tr>`
              }
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
                    ${
                      municipal
                        ? ''
                        : `<button class="btn btn-sm btn-outline" data-action="admin:irMunicipio" data-id="${esc(m.id)}" data-valor="incidencias" title="Ver incidencias de este municipio">
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
                    </button>`
                    }
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
  const activos = new Set(expandirPermisos(permisos));
  contenedor.innerHTML = htmlPermisos(activos);
}

export function prepararFormRol(rol = null, { tipo = null } = {}) {
  const clase = tipo || rol?.tipo || 'especial';
  const id = $('rolEspecialId');
  if (!id) return;
  $('rolEspecialTipo').value = clase;
  id.value = rol?.id || '';
  $('rolEspecialNombre').value = rol?.nombre || rol?.etiqueta || '';
  $('rolEspecialNombre').readOnly = clase === 'integrado';
  $('rolEspecialDescripcion').value = rol?.descripcion || '';
  $('rolEspecialBase').value = rol?.rolBase || rol?.rolPlantilla || 'funcionario';
  // La plantilla de un rol del sistema no se puede cambiar, pero el selector
  // se vuelve a habilitar al editar cualquier otro rol.
  $('rolEspecialBase').disabled = clase === 'integrado';
  $('rolEspecialBaseBox')?.classList.toggle('u-oculto', false);
  const notaBase = $('rolEspecialBaseNota');
  if (notaBase) {
    notaBase.textContent =
      clase === 'integrado'
        ? 'La plantilla de un rol del sistema no se cambia; solo su matriz de permisos.'
        : 'El rol hereda de esta plantilla su comportamiento y su alcance.';
    notaBase.classList.remove('u-oculto');
  }
  $('rolEspecialActivo').checked = rol ? rol.activo !== false : true;
  $('rolEspecialActivoBox')?.classList.toggle('u-oculto', clase === 'integrado');
  $('rolEspecialTerritorioBox')?.classList.toggle('u-oculto', clase !== 'propio');
  if ($('rolEspecialTerritorio')) {
    $('rolEspecialTerritorio').value = rol?.territorio || 'municipios';
  }
  renderPermisosRol(rol?.permisos || []);
  $('rolEspecialFormTitulo').textContent =
    clase === 'integrado'
      ? `Permisos de ${rol?.etiqueta || 'rol del sistema'}`
      : clase === 'propio'
        ? rol
          ? 'Editar rol propio'
          : 'Nuevo rol propio'
        : rol
          ? 'Editar rol especial'
          : 'Nuevo rol especial';
  $('rolEspecialAplicar')?.classList.add('u-oculto');
  // Al editar, el formulario está debajo de las listas: se lleva a la vista
  // para que el clic en «Editar permisos» muestre algo.
  if (rol?.id) {
    document.getElementById('rolEspecialFormTitulo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function valoresRolForm() {
  return {
    id: $('rolEspecialId')?.value || null,
    tipo: $('rolEspecialTipo')?.value || 'especial',
    nombre: $('rolEspecialNombre')?.value.trim() || '',
    descripcion: $('rolEspecialDescripcion')?.value.trim() || '',
    rolBase: $('rolEspecialBase')?.value || 'funcionario',
    territorio: $('rolEspecialTerritorio')?.value || 'municipios',
    activo: $('rolEspecialActivo')?.checked !== false,
    permisos: [...document.querySelectorAll('#rolEspecialPermisos input[data-permiso]')]
      .filter((c) => c.checked)
      .map((c) => c.dataset.permiso)
  };
}

export function rolPorId(id) {
  // Los roles especiales usan id de texto y los del sistema/propios usan id
  // numérico: `dataset.id` siempre llega como cadena, así que se comparan
  // ambos como texto.
  return (moduleState.rolesEspeciales || []).find((r) => String(r.id) === String(id)) || null;
}

/** Abre el formulario de rol desde el alta de usuario, con su plantilla. */
export function prepararRolDesdeUsuario(plantilla = 'funcionario', tipo = 'especial') {
  prepararFormRol(null, { tipo });
  const base = $('rolEspecialBase');
  if (base) base.value = plantilla;
  $('rolEspecialFormTitulo').textContent =
    tipo === 'propio' ? 'Nuevo rol propio para esta cuenta' : 'Nuevo rol especial para esta cuenta';
}

/** Guarda el rol recién creado y muestra «Aplicar a esta cuenta». */
export function ofrecerAplicarRol(rol = {}) {
  moduleState.rolRecienCreado = rol;
  $('rolEspecialAplicar')?.classList.remove('u-oculto');
  $('rolEspecialFormTitulo').textContent = `Rol «${rol.etiqueta || rol.nombre}» guardado`;
}

export function rolRecienCreado() {
  return moduleState.rolRecienCreado || null;
}

/**
 * Aplica el rol al formulario del alta sin tocar el resto de campos: el modal
 * de usuario sigue abierto detrás y conserva lo ya escrito.
 */
export function aplicarRolAlFormulario(rol = {}) {
  const selector = $('usuarioRol');
  if (!selector || !rol?.id) return;
  if (rol.tipo === 'propio') {
    renderRolesPropiosEnSelect(rol.id);
    selector.value = `propio:${rol.id}`;
    selector.disabled = false;
    renderPermisosCuenta(null);
    actualizarNotaMunicipioUsuario();
  } else {
    // Rol especial: se vuelve a pintar el selector y se deja marcado.
    renderSelectRolEspecial(rol.id);
  }
  moduleState.rolRecienCreado = null;
}

export function rolSistemaPorId(id) {
  return (moduleState.rolesIntegrados || []).find((r) => String(r.id) === String(id)) || null;
}

export function rolPropioPorId(id) {
  return (moduleState.rolesPropios || []).find((r) => String(r.id) === String(id)) || null;
}

/** Lista de roles del sistema (matriz editable). */
export function renderRolesSistema(roles = []) {
  moduleState.rolesIntegrados = roles;
  const contenedor = $('rolesIntegradosLista');
  if (!contenedor) return;
  if (!roles.length) {
    contenedor.innerHTML = '<p class="campo-nota">No se pudieron cargar los roles del sistema.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Rol</th><th>Territorio</th><th>Permisos</th><th>Cuentas</th><th></th></tr></thead>
        <tbody>
          ${roles
            .map(
              (r) => `<tr>
                <td><strong>${esc(r.etiqueta)}</strong><div class="campo-nota">${esc(r.clave)}</div></td>
                <td>${esc(r.territorio)}</td>
                <td>${(r.permisos || []).length}</td>
                <td>${r.cuentas ?? 0}</td>
                <td class="u-acciones-tabla">
                  <button class="btn btn-outline btn-sm" data-action="roles:editarSistema" data-id="${esc(r.id)}" title="Editar permisos"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-outline btn-sm" data-action="roles:restablecer" data-id="${esc(r.id)}" title="Restablecer a fábrica"><i class="bi bi-arrow-counterclockwise"></i></button>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Lista de roles propios (los que crea el administrador maestro). */
export function renderRolesPropios(roles = []) {
  moduleState.rolesPropios = roles;
  const contenedor = $('rolesPropiosLista');
  if (!contenedor) return;
  if (!roles.length) {
    contenedor.innerHTML =
      '<p class="campo-nota">Aún no hay roles propios. Crea uno con el formulario de abajo.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Rol</th><th>Plantilla</th><th>Territorio</th><th>Permisos</th><th>Cuentas</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${roles
            .map(
              (r) => `<tr>
                <td><strong>${esc(r.etiqueta)}</strong><div class="campo-nota">${esc(r.descripcion || '')}</div></td>
                <td>${esc(r.rolPlantilla)}</td>
                <td>${esc(r.territorio)}</td>
                <td>${(r.permisos || []).length}</td>
                <td>${r.cuentas ?? 0}</td>
                <td><span class="inc-badge badge-${r.activo ? 'verde' : 'gris'}">${r.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td class="u-acciones-tabla">
                  <button class="btn btn-outline btn-sm" data-action="roles:editarPropio" data-id="${esc(r.id)}" title="Editar"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-danger btn-sm" data-action="roles:eliminarPropio" data-id="${esc(r.id)}" title="Eliminar"><i class="bi bi-trash3"></i></button>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Solicitudes de cambio de contraseña (solo administración). */
export function renderSolicitudesPassword(solicitudes = []) {
  const contenedor = $('solicitudesPasswordLista');
  if (!contenedor) return;
  if (!solicitudes.length) {
    contenedor.innerHTML =
      '<p class="campo-nota">No hay solicitudes de contraseña pendientes ni recientes.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Cuenta</th><th>Pidió</th><th>Motivo</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
        <tbody>
          ${solicitudes
            .map(
              (s) => `<tr data-solicitud="${esc(s.id)}">
                <td><strong>${esc(s.nombre || s.username)}</strong><div class="campo-nota">${esc(s.username)}</div></td>
                <td>${esc(
                  s.solicitadoPor && s.solicitadoPor !== s.username ? s.solicitadoPor : 'La propia cuenta'
                )}</td>
                <td>${esc(s.motivo)}${
                  s.respuesta ? `<div class="campo-nota">Respuesta: ${esc(s.respuesta)}</div>` : ''
                }</td>
                <td><span class="inc-badge badge-${
                  s.estado === 'resuelta' ? 'verde' : s.estado === 'rechazada' ? 'rojo' : 'amarillo'
                }">${esc(s.estado)}</span></td>
                <td>${fmtFechaCorta(s.creadoEn)}</td>
                <td class="u-acciones-tabla">
                  ${
                    s.estado === 'pendiente'
                      ? `<button class="btn btn-success btn-sm" data-action="password:aprobarSolicitud" data-id="${esc(s.id)}" title="Restablecer contraseña"><i class="bi bi-check2"></i></button>
                         <button class="btn btn-danger btn-sm" data-action="password:rechazarSolicitud" data-id="${esc(s.id)}" title="Rechazar"><i class="bi bi-x"></i></button>`
                      : ''
                  }
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Solicitudes de baja de cuentas (solo administración). */
export function renderSolicitudesBaja(solicitudes = []) {
  const contenedor = $('solicitudesBajaLista');
  if (!contenedor) return;
  if (!solicitudes.length) {
    contenedor.innerHTML =
      '<p class="campo-nota">No hay solicitudes de baja pendientes ni recientes.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Cuenta</th><th>Pidió</th><th>Motivo</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${solicitudes
            .map(
              (s) => `<tr data-solicitud="${esc(s.id)}">
                <td><strong>${esc(s.nombre || s.username)}</strong><div class="campo-nota">${esc(s.username)}</div></td>
                <td>${esc(s.solicitadoPor || '—')}</td>
                <td>${esc(s.motivo)}${
                  s.respuesta ? `<div class="campo-nota">Respuesta: ${esc(s.respuesta)}</div>` : ''
                }</td>
                <td><span class="inc-badge badge-${
                  s.estado === 'aprobada' ? 'verde' : s.estado === 'rechazada' ? 'rojo' : 'amarillo'
                }">${esc(s.estado)}</span></td>
                <td class="u-acciones-tabla">
                  ${
                    s.estado === 'pendiente'
                      ? `<button class="btn btn-success btn-sm" data-action="baja:aprobar" data-id="${esc(s.id)}" title="Aplicar la baja"><i class="bi bi-check2"></i></button>
                         <button class="btn btn-danger btn-sm" data-action="baja:rechazar" data-id="${esc(s.id)}" title="Rechazar"><i class="bi bi-x"></i></button>`
                      : ''
                  }
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Solicitudes de alta de cuentas (solo administración). */
export function renderSolicitudesAlta(solicitudes = []) {
  const contenedor = $('solicitudesAltaLista');
  if (!contenedor) return;
  moduleState.solicitudesAlta = solicitudes;
  if (!solicitudes.length) {
    contenedor.innerHTML =
      '<p class="campo-nota">No hay solicitudes de alta pendientes ni recientes.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Cuenta solicitada</th><th>Pidió</th><th>Contacto</th><th>Notas</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${solicitudes
            .map(
              (s) => `<tr data-solicitud="${esc(s.id)}">
                <td><strong>${esc(s.nombre)}</strong><div class="campo-nota">${esc(s.username)}</div></td>
                <td>${esc(s.solicitadoPor || '—')}</td>
                <td>${esc(s.correo || '—')}${
                  s.telefono ? `<div class="campo-nota">${esc(s.telefono)}</div>` : ''
                }</td>
                <td class="u-fs-12px">${esc(s.notas || '—')}${
                  s.respuesta ? `<div class="campo-nota">Respuesta: ${esc(s.respuesta)}</div>` : ''
                }</td>
                <td><span class="inc-badge badge-${
                  s.estado === 'aprobada' ? 'verde' : s.estado === 'rechazada' ? 'rojo' : 'amarillo'
                }">${esc(s.estado)}</span></td>
                <td class="u-acciones-tabla">
                  ${
                    s.estado === 'pendiente'
                      ? `<button class="btn btn-success btn-sm" data-action="alta:aprobar" data-id="${esc(s.id)}" title="Crear la cuenta"><i class="bi bi-check2"></i></button>
                         <button class="btn btn-danger btn-sm" data-action="alta:rechazar" data-id="${esc(s.id)}" title="Rechazar"><i class="bi bi-x"></i></button>`
                      : ''
                  }
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Limpia el formulario de solicitud de alta. */
export function prepararModalAlta() {
  for (const id of [
    'altaUsuarioNombre',
    'altaUsuarioUsername',
    'altaUsuarioCorreo',
    'altaUsuarioTelefono',
    'altaUsuarioNotas'
  ]) {
    if ($(id)) $(id).value = '';
  }
}

export function valoresAltaForm() {
  return {
    nombre: $('altaUsuarioNombre')?.value.trim() || '',
    username: $('altaUsuarioUsername')?.value.trim() || '',
    correo: $('altaUsuarioCorreo')?.value.trim() || '',
    telefono: $('altaUsuarioTelefono')?.value.trim() || '',
    notas: $('altaUsuarioNotas')?.value.trim() || ''
  };
}

/** Prepara el modal de solicitud de baja. */
export function prepararModalBaja(usuario = {}) {
  if ($('bajaUsuarioId')) $('bajaUsuarioId').value = usuario.id || '';
  if ($('bajaUsuarioNombre')) {
    $('bajaUsuarioNombre').textContent = `la cuenta de ${usuario.nombre || usuario.username || ''}`;
  }
  if ($('bajaUsuarioMotivo')) $('bajaUsuarioMotivo').value = '';
}

export function valoresBajaForm() {
  return {
    usuarioId: $('bajaUsuarioId')?.value || '',
    motivo: $('bajaUsuarioMotivo')?.value.trim() || ''
  };
}

/** Prepara el modal para pedir el cambio de contraseña de otra cuenta. */
export function prepararModalSolicitudPassword(usuario = {}) {
  if ($('solicitudPasswordUsuarioId')) $('solicitudPasswordUsuarioId').value = usuario.id || '';
  if ($('solicitudPasswordUsuarioNombre')) {
    $('solicitudPasswordUsuarioNombre').textContent = usuario.nombre || usuario.username || 'esta cuenta';
  }
  if ($('solicitudPasswordMotivo')) $('solicitudPasswordMotivo').value = '';
}

export function valoresSolicitudPassword() {
  return {
    usuarioId: $('solicitudPasswordUsuarioId')?.value || '',
    motivo: $('solicitudPasswordMotivo')?.value.trim() || ''
  };
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
  {
    esAdmin = false,
    puedeCrear = esAdmin,
    puedeEditar = puedeCrear,
    puedeEliminar = false,
    puedeRevelar = false,
    puedeSolicitarBaja = false,
    puedeSolicitarPassword = false,
    puedeSolicitarAlta = false,
    puedeReactivar = false,
    puedeGestionarClaves = false,
    usuarioActualId = null
  } = {}
) {
  const contenedor = $('usuariosLista');
  if (!contenedor) return;

  const botonNuevo = $('btnNuevoUsuario');
  if (botonNuevo) botonNuevo.style.display = puedeCrear ? 'inline-flex' : 'none';
  const botonSolicitar = $('btnSolicitarAlta');
  if (botonSolicitar) botonSolicitar.classList.toggle('u-oculto', !puedeSolicitarAlta);

  if (!usuarios.length) {
    contenedor.innerHTML =
      '<div class="empty-state"><i class="bi bi-person-badge"></i><div>No hay cuentas del personal dadas de alta</div></div>';
    return;
  }

  const conAcciones =
    puedeEditar ||
    puedeEliminar ||
    puedeRevelar ||
    puedeSolicitarBaja ||
    puedeSolicitarPassword ||
    puedeReactivar ||
    puedeGestionarClaves;
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead>
          <tr>
            <th>Usuario</th><th>Nombre</th><th>Rol</th><th>Alcance</th><th>Escritura</th><th>Estado</th>
            ${conAcciones ? '<th>Acciones</th>' : ''}
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
              const esCuentaAdmin = ['admin', 'admin_estatal', 'admin_municipal'].includes(u.rol);
              return `
              <tr data-usuario="${esc(u.id)}">
                <td><code>${esc(u.username)}</code></td>
                <td>${esc(u.nombre)}${u.correo ? `<div class="campo-nota">${esc(u.correo)}</div>` : ''}</td>
                <td><span class="inc-badge badge-${color}">${esc(u.rol)}</span>${
                  u.rolPropio?.etiqueta
                    ? `<div class="campo-nota">◆ ${esc(u.rolPropio.etiqueta)}</div>`
                    : ''
                }${
                  u.rolPersonalizado?.nombre
                    ? `<div class="campo-nota">★ ${esc(u.rolPersonalizado.nombre)}</div>`
                    : ''
                }</td>
                <td>${alcance ? esc(alcance) : '<span class="u-suave">Global</span>'}</td>
                <td>${u.puedeEscribir ? '✍️ Sí' : '👁️ Solo lectura'}</td>
                <td>${u.activo !== false ? '✅ Activa' : '🚫 Inactiva'}</td>
                ${
                  conAcciones
                    ? `<td class="u-nowrap">
                         ${
                           puedeEditar
                             ? `<button class="btn btn-sm btn-outline" data-action="admin:usuarioEditar" data-id="${esc(u.id)}" title="Editar cuenta">
                                  <i class="bi bi-pencil-square"></i>
                                </button>`
                             : ''
                         }
                         ${
                           puedeEliminar
                             ? `<button class="btn btn-sm btn-danger" data-action="admin:usuarioEliminar" data-id="${esc(u.id)}" title="Desactivar cuenta">
                                  <i class="bi bi-person-x"></i>
                                </button>`
                             : ''
                         }
                         ${
                           puedeReactivar && u.activo === false
                             ? `<button class="btn btn-sm btn-success" data-action="admin:usuarioReactivar" data-id="${esc(u.id)}" title="Reactivar esta cuenta">
                                  <i class="bi bi-arrow-counterclockwise"></i>
                                </button>`
                             : ''
                         }
                         ${
                           puedeRevelar
                             ? `<button class="btn btn-sm btn-outline" data-action="password:ver" data-id="${esc(u.id)}" title="Consultar contraseña (queda en auditoría)">
                                  <i class="bi bi-key"></i>
                                </button>`
                             : ''
                         }
                         ${
                           puedeGestionarClaves && !esCuentaAdmin
                             ? `<button class="btn btn-sm btn-outline" data-action="admin:claveUsuarioVer" data-id="${esc(u.id)}" title="Ver o renovar la clave de activación">
                                  <i class="bi bi-shield-lock"></i>
                                </button>`
                             : ''
                         }
                         ${
                           puedeSolicitarBaja && u.activo !== false
                             ? `<button class="btn btn-sm btn-outline" data-action="baja:solicitar" data-id="${esc(u.id)}" title="Solicitar baja de esta cuenta">
                                  <i class="bi bi-person-dash"></i>
                                </button>`
                             : ''
                         }
                         ${
                           puedeSolicitarPassword && !esCuentaAdmin && u.activo !== false &&
                           String(u.id) !== String(usuarioActualId || '')
                             ? `<button class="btn btn-sm btn-outline" data-action="password:solicitarCuenta" data-id="${esc(u.id)}" title="Solicitar cambio de contraseña (la administración la restablece)">
                                  <i class="bi bi-shield-lock"></i>
                                </button>`
                             : ''
                         }
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

/** Valor actual del selector de rol (`funcionario`, `propio:<id>`...). */
function rolSeleccionadoValor() {
  return $('usuarioRol')?.value || 'funcionario';
}

/** Rol propio elegido en el formulario, o `null`. */
export function rolPropioSeleccionado() {
  const valor = rolSeleccionadoValor();
  if (!valor.startsWith('propio:')) return null;
  const id = valor.slice('propio:'.length);
  return (moduleState.rolesPropios || []).find((r) => r.id === id) || null;
}

/** Plantilla real del rol elegido (los roles propios heredan de ella). */
export function rolPlantillaActual() {
  return rolPropioSeleccionado()?.rolPlantilla || rolSeleccionadoValor();
}

/** Añade los roles propios al selector de rol sin duplicarlos. */
export function renderRolesPropiosEnSelect(seleccionadoId = null) {
  const selector = $('usuarioRol');
  if (!selector) return;
  selector.querySelectorAll('optgroup[data-propios]').forEach((grupo) => grupo.remove());
  const propios = (moduleState.rolesPropios || []).filter(
    (rol) => rol.activo !== false && rol.rolPlantilla !== 'admin'
  );
  if (propios.length) {
    const grupo = document.createElement('optgroup');
    grupo.label = 'Roles propios';
    grupo.dataset.propios = '1';
    for (const rol of propios) {
      const opcion = document.createElement('option');
      opcion.value = `propio:${rol.id}`;
      opcion.dataset.propio = rol.id;
      opcion.textContent = `${rol.etiqueta} (${rol.rolPlantilla})`;
      grupo.append(opcion);
    }
    selector.append(grupo);
  }
  if (seleccionadoId) selector.value = `propio:${seleccionadoId}`;
}

/** Rellena el selector de rol especial según el rol base elegido. */
export function renderSelectRolEspecial(seleccionado = null) {
  const selector = $('usuarioRolEspecial');
  if (!selector) return;
  const rolBase = rolPlantillaActual();
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

export function prepararModalUsuario({
  usuario = null,
  municipios = [],
  estados = [],
  claves = [],
  roles = {},
  permiteClaves = false,
  permitePassword = false,
  permiteRol = true,
  permiteTerritorio = true,
  permitePermisos = true,
  textoTerritorioFijo = ''
} = {}) {
  const edicion = Boolean(usuario);
  moduleState.municipiosUsuario = municipios;
  moduleState.catalogoEstadosUsuario = estados;
  moduleState.rolesPropios = roles.propios || [];
  moduleState.rolesIntegrados = roles.integrados || [];
  moduleState.permiteRol = permiteRol;
  moduleState.permiteTerritorio = permiteTerritorio;
  moduleState.permitePermisos = permitePermisos;
  moduleState.textoTerritorioFijo = textoTerritorioFijo;

  $('modalUsuarioTitle').textContent = edicion ? 'Editar usuario' : 'Nuevo usuario';
  $('usuarioId').value = usuario?.id || '';
  $('usuarioUsernameBox').style.display = edicion ? 'none' : 'block';
  $('usuarioUsername').value = usuario?.username || '';
  $('usuarioNombre').value = usuario?.nombre || '';
  $('usuarioRol').disabled = !permiteRol;
  $('usuarioRol').value = usuario?.rol || 'funcionario';
  renderRolesPropiosEnSelect(usuario?.rolPropioId || null);
  $('usuarioRolEspecial').disabled = !permiteRol;
  renderSelectRolEspecial(usuario?.rolPersonalizadoId || null);
  renderPermisosCuenta(usuario);
  $('usuarioPermisosBox')?.classList.toggle('u-oculto', !permitePermisos);
  $('btnCrearRolEspecial')?.classList.toggle('u-oculto', !permiteRol);

  // La clave solo se elige al dar de alta: define rol, territorio y permisos.
  // Solo la administración puede generar claves y nunca al editar una cuenta.
  const claveBox = $('usuarioClaveAccesoBox');
  if (claveBox) claveBox.classList.toggle('u-oculto', edicion || !permiteClaves);
  $('usuarioClaveBox')?.classList.toggle('u-oculto', edicion || !permiteClaves);
  const claveSelect = $('usuarioClaveAcceso');
  if (claveSelect) claveSelect.value = '';
  renderClavesUsuario(edicion ? [] : claves);
  actualizarPreviewClave();

  const asignados = usuario
    ? usuario.municipios && usuario.municipios.length
      ? usuario.municipios
      : usuario.municipioId
        ? [usuario.municipioId]
        : []
    : [];
  moduleState.selectorTerritorio = renderTerritorioUsuario(
    municipios,
    { asignados, estados: usuario?.estados || [] },
    estados,
    { expandirEstados: rolExigeMunicipios(rolPlantillaActual()) }
  );

  $('usuarioCorreo').value = usuario?.correo || '';
  $('usuarioPassword').value = '';
  $('usuarioPasswordNota').textContent = permitePassword
    ? edicion
      ? 'Déjala vacía para conservar la contraseña actual.'
      : 'Mínimo 8 caracteres.'
    : 'Solo la administración cambia contraseñas. El funcionario puede solicitar el cambio desde «Mi cuenta».';
  // Al crear siempre se pide la contraseña inicial; al editar, solo la
  // administración puede cambiarla.
  $('usuarioPasswordBox')?.classList.toggle('u-oculto', !permitePassword && edicion);
  if ($('usuarioPassword')) $('usuarioPassword').required = !edicion;

  $('usuarioActivoBox').style.display = edicion ? 'block' : 'none';
  $('usuarioActivo').checked = usuario?.activo !== false;
  $('usuarioActivo').disabled = !permiteRol;
  $('usuarioPuedeEscribir').checked =
    usuario?.puedeEscribir !== undefined
      ? usuario.puedeEscribir === true
      : (usuario?.rol || 'funcionario') === 'funcionario';

  // Clave de acceso: por defecto se ofrece al dar de alta (es el segundo factor
  // del login del personal) y queda apagada al editar, para no inundar de
  // códigos cuando solo se cambia, por ejemplo, el nombre.
  if ($('usuarioGenerarClave')) $('usuarioGenerarClave').checked = !edicion && permiteClaves;
  if ($('usuarioClaveUsos')) $('usuarioClaveUsos').value = '';
  if ($('usuarioClaveExpira')) $('usuarioClaveExpira').value = '';

  actualizarNotaMunicipioUsuario();
}

/** ¿El rol solo admite municipios? Entonces «estado completo» se expande. */
export function rolExigeMunicipios(rol = 'funcionario') {
  return ['funcionario', 'admin_municipal'].includes(rol);
}

/** Selectores territoriales activos del modal de usuario. */
const moduleState = {
  selectorTerritorio: null,
  selectorClaveTerritorio: null,
  selectorAvisosClave: null,
  claveAvisos: null,
  municipiosClaves: [],
  resumenMunicipios: null,
  rolesEspeciales: [],
  rolesIntegrados: [],
  rolesPropios: [],
  claves: [],
  clavesUsuario: [],
  filtroEstadoInicial: false,
  passwordUsuario: null,
  permiteRol: true,
  permiteTerritorio: true,
  permitePermisos: true,
  textoTerritorioFijo: ''
};

/**
 * Selector territorial del alta de cuentas.
 *
 * Un solo componente por bloques: se escribe el estado (con autocompletado),
 * se busca el municipio y el bloque vacío permite añadir otro estado. Cuando
 * el rol exige municipios (funcionario, administrador municipal), «incluir el
 * estado completo» expande el estado a todos sus municipios en vez de enviar
 * `estados`, que esos roles no aceptan.
 */
export function renderTerritorioUsuario(municipios = [], { asignados = [], estados = [] } = {}, catalogoEstados = [], { expandirEstados = true } = {}) {
  const contenedor = $('usuarioTerritorioSelector');
  if (!contenedor) return null;
  moduleState.selectorTerritorio = crearSelectorTerritorialPorEstado({
    contenedor: 'usuarioTerritorioSelector',
    municipios,
    seleccionados: asignados,
    estados,
    catalogoEstados,
    alCompletarEstado: expandirEstados ? 'municipios' : 'estados'
  });
  return moduleState.selectorTerritorio;
}

/** Explica qué territorio exige cada rol y ajusta el selector por bloques. */
export function actualizarNotaMunicipioUsuario() {
  const rol = rolPlantillaActual();
  const nota = $('usuarioMunicipiosNota');
  const territorioBox = $('usuarioTerritorioBox');
  const escribirBox = $('usuarioPuedeEscribirBox');
  const escribir = $('usuarioPuedeEscribir');
  const selectorTerritorio = $('usuarioTerritorioSelector');
  const puedeRol = moduleState.permiteRol !== false;
  const puedeTerritorio = moduleState.permiteTerritorio !== false;
  renderSelectRolEspecial();

  const usaEstados = ['enlace_estatal', 'enlace_federal', 'admin_estatal'].includes(rol);
  const usaMunicipios = [
    'funcionario',
    'auditor',
    'soporte',
    'admin_municipal',
    'admin'
  ].includes(rol);

  // Cuenta gestionada por un funcionario: el territorio lo fija el servidor.
  if (!puedeTerritorio) {
    territorioBox?.classList.remove('u-oculto');
    selectorTerritorio?.classList.add('u-oculto');
    if (nota && moduleState.textoTerritorioFijo) nota.textContent = moduleState.textoTerritorioFijo;
    if (escribirBox) escribirBox.classList.add('u-oculto');
    return;
  }

  selectorTerritorio?.classList.remove('u-oculto');
  if (nota) {
    nota.textContent =
      rol === 'funcionario'
        ? 'Obligatorio: el funcionario solo ve y gestiona estos municipios. Elige el estado, busca el municipio y añade otro estado si hace falta.'
        : rol === 'auditor'
          ? 'Puede asignarse por municipios o por estados (solo lectura).'
          : rol === 'admin'
            ? 'Opcional: sin territorio, el administrador maestro ve todo el país.'
            : rol === 'admin_municipal'
              ? 'Obligatorio: el administrador municipal solo gestiona estos municipios.'
              : rol === 'admin_estatal'
                ? 'Obligatorio: el administrador estatal gestiona todos los municipios de sus estados.'
                : rol === 'soporte'
                  ? 'Elige los municipios o estados cuyos tickets atenderá.'
                  : 'Selecciona los estados que podrá consultar (solo lectura).';
  }
  if (territorioBox) territorioBox.classList.toggle('u-oculto', !usaMunicipios && !usaEstados);
  if (escribirBox) escribirBox.classList.toggle('u-oculto', !puedeRol || !usaMunicipios);
  if (escribir && !usaMunicipios) escribir.checked = false;

  // El modo de «estado completo» depende del rol: un funcionario no puede
  // recibir `estados`, así que se expande a todos sus municipios.
  const actuales = {
    asignados: moduleState.selectorTerritorio?.municipios() || [],
    estados: moduleState.selectorTerritorio?.estados() || []
  };
  if (usaMunicipios || usaEstados) {
    moduleState.selectorTerritorio = renderTerritorioUsuario(
      moduleState.municipiosUsuario || [],
      actuales,
      moduleState.catalogoEstadosUsuario || [],
      { expandirEstados: rolExigeMunicipios(rol) }
    );
  }
}

/** Casilla de un permiso concreto, con su botón de ayuda. */
function casillaPermiso(permiso, activo, etiqueta) {
  return `<div class="permiso-fila">
    <label class="check-line"><input type="checkbox" data-permiso="${esc(permiso)}"${
      activo ? ' checked' : ''
    }><span>${esc(etiqueta || ETIQUETAS_PERMISO[permiso] || permiso)}</span></label>
    <button type="button" class="ayuda-permiso" data-action="permisos:ayuda" data-valor="${esc(
      permiso
    )}" title="¿Qué hace este permiso?" aria-label="Ayuda de ${esc(
      etiqueta || ETIQUETAS_PERMISO[permiso] || permiso
    )}">?</button>
  </div>`;
}

/** Pinta la matriz agrupada por módulo; los módulos CRUD muestran sus acciones. */
function htmlPermisos(activos = new Set()) {
  return GRUPOS_PERMISOS.map((grupo) => {
    if (grupo.crud) {
      const modulo = PERMISOS_CRUD.find((m) => m.clave === grupo.crud);
      if (!modulo) return '';
      const filas = ACCIONES_CRUD.map(([accion, etiqueta]) => {
        const permiso = modulo.permisos[accion];
        const texto = modulo.etiquetas?.[accion] || etiqueta;
        return permiso ? casillaPermiso(permiso, activos.has(permiso), texto) : '';
      }).join('');
      return `
        <fieldset class="permisos-grupo">
          <legend>${esc(modulo.etiqueta)}</legend>
          <p class="campo-nota">${esc(modulo.nota || '')}</p>
          <div class="permisos-filas">${filas}</div>
        </fieldset>`;
    }
    const filas = (grupo.permisos || [])
      .filter((permiso) => PERMISOS_LISTA.includes(permiso))
      .map((permiso) => casillaPermiso(permiso, activos.has(permiso)))
      .join('');
    if (!filas) return '';
    return `
      <fieldset class="permisos-grupo">
        <legend>${esc(grupo.titulo)}</legend>
        <div class="permisos-filas">${filas}</div>
      </fieldset>`;
  }).join('');
}

/** Pinta la matriz; `usuario.permisos` guarda solo las excepciones. */
export function renderPermisos(usuario, rol = 'funcionario') {
  const contenedor = $('usuarioPermisos');
  if (!contenedor) return;
  const activos = permisosEfectivosDeRol(rol, usuario?.permisos || {});
  contenedor.innerHTML = htmlPermisos(activos);
}

/**
 * Matriz de la cuenta según el rol elegido. Si es un rol propio, su matriz es
 * la base; si es integrado, la del rol con las excepciones de la cuenta.
 */
export function renderPermisosCuenta(usuario = null) {
  const contenedor = $('usuarioPermisos');
  if (!contenedor) return;
  const propio = rolPropioSeleccionado();
  const activos = propio
    ? new Set(expandirPermisos(propio.permisos || []))
    : permisosEfectivosDeRol(rolPlantillaActual(), usuario?.permisos || {});
  contenedor.innerHTML = htmlPermisos(activos);
}

/** Pinta la matriz de una clave con la lista exacta que concede. */
export function renderPermisosClave(rol = 'funcionario', permisos = null) {
  const contenedor = $('clavePermisos');
  if (!contenedor) return;
  const activos = Array.isArray(permisos)
    ? new Set(expandirPermisos(permisos))
    : new Set(permisosBaseDeRol(rol));
  contenedor.innerHTML = htmlPermisos(activos);
}

/** Rellena la matriz del usuario con una lista de permisos (clave elegida). */
export function renderPermisosDesdeLista(permisos = []) {
  const contenedor = $('usuarioPermisos');
  if (!contenedor) return;
  contenedor.innerHTML = htmlPermisos(new Set(expandirPermisos(permisos || [])));
}

function leerPermisos() {
  const salida = {};
  document.querySelectorAll('#usuarioPermisos input[data-permiso]').forEach((casilla) => {
    salida[casilla.dataset.permiso] = casilla.checked;
  });
  return salida;
}

export function leerPermisosClave() {
  return [...document.querySelectorAll('#clavePermisos input[data-permiso]')]
    .filter((casilla) => casilla.checked)
    .map((casilla) => casilla.dataset.permiso);
}

/* ---------------------- clave aplicada al alta de cuenta ------------------ */

function claveEstaVigente(clave = {}) {
  if (clave.activa === false) return false;
  // Sin vencimiento ni cupo la clave está incompleta: no puede asignarse a
  // una cuenta hasta que la administración la complete.
  if (!clave.expiraEn || clave.usosMaximos === null || clave.usosMaximos === undefined) return false;
  if (new Date(clave.expiraEn).getTime() <= Date.now()) return false;
  if (Number(clave.usos) >= Number(clave.usosMaximos)) return false;
  return true;
}

/** Rellena el selector de claves disponibles al crear una cuenta. */
export function renderClavesUsuario(claves = []) {
  const selector = $('usuarioClaveAcceso');
  if (!selector) return;
  moduleState.clavesUsuario = claves;
  const disponibles = (claves || []).filter(claveEstaVigente);
  selector.innerHTML =
    '<option value="">— Sin clave existente: genera una nueva abajo —</option>' +
    disponibles
      .map((clave) => {
        const vinculados = Number(clave.usos || 0);
        const cupo = `${vinculados}/${clave.usosMaximos}`;
        const vence = String(clave.expiraEn || '').slice(0, 10) || 'sin fecha';
        return `<option value="${esc(clave.id)}">${esc(clave.nombre || clave.codigo)} · ${
          esc(clave.rolSugerido || 'sin rol')
        } · ${esc((clave.permisos || []).length)} permiso(s) · cupo ${esc(cupo)} · vence ${esc(vence)}</option>`;
      })
      .join('');
  if (!disponibles.length) {
    selector.options[0].textContent =
      '— No hay claves completas y vigentes: genera una nueva abajo —';
  }
}

/** Clave seleccionada en el alta (o null). */
export function claveUsuarioSeleccionada() {
  const id = $('usuarioClaveAcceso')?.value || '';
  if (!id) return null;
  return (moduleState.clavesUsuario || []).find((clave) => clave.id === id) || null;
}

/**
 * Copia a la cuenta el rol, el territorio y los permisos de la clave.
 * El servidor vuelve a imponerlos al guardar; esto solo evita que el
 * administrador tenga que repetirlos a mano.
 */
export function limpiarClaveFormulario() {
  const selectorRol = $('usuarioRol');
  if (selectorRol) selectorRol.disabled = false;
  moduleState.selectorTerritorio?.limpiar();
  renderPermisosCuenta(null);
  actualizarPreviewClave();
}

/** Texto de vista previa bajo el selector de clave. */
export function actualizarPreviewClave() {
  const nota = $('usuarioClavePreview');
  if (!nota) return;
  const clave = claveUsuarioSeleccionada();
  if (!clave) {
    nota.textContent =
      'Sin clave existente: para que la cuenta pueda entrar debes generar una clave nueva abajo. La clave quedará ligada a esta cuenta y no podrá usarse en otra.';
    return;
  }
  const territorio = (clave.estados || []).length
    ? `${(clave.estados || []).length} estado(s)`
    : `${(clave.municipios || []).length} municipio(s)`;
  const cupo = `${Number(clave.usos || 0)}/${clave.usosMaximos}`;
  nota.textContent = `Clave «${clave.nombre || clave.codigo}»: rol ${
    clave.rolSugerido || 'sin rol'
  }, ${territorio}, ${(clave.permisos || []).length} permiso(s), cupo ${cupo} y vence el ${
    String(clave.expiraEn || '').slice(0, 10) || 'sin fecha'
  }. Al guardar, la cuenta quedará vinculada a esta clave.`;
}

export function aplicarClaveFormulario(clave = null) {
  if (!clave) return;
  const selectorRol = $('usuarioRol');
  if (selectorRol && clave.rolSugerido) {
    const opcion = [...selectorRol.options].find((o) => o.value === clave.rolSugerido);
    if (opcion) selectorRol.value = clave.rolSugerido;
  }
  // Con clave, el rol y los permisos son los de la clave: se muestran
  // bloqueados para que no parezca que se pueden cambiar en este formulario.
  if (selectorRol) selectorRol.disabled = true;
  actualizarNotaMunicipioUsuario();

  if ((clave.estados || []).length) {
    moduleState.selectorTerritorio?.fijarMunicipios([]);
    moduleState.selectorTerritorio?.fijarEstados(clave.estados);
  } else {
    moduleState.selectorTerritorio?.fijarMunicipios(clave.municipios || []);
    moduleState.selectorTerritorio?.fijarEstados([]);
  }

  renderPermisosDesdeLista(
    Array.isArray(clave.permisos)
      ? clave.permisos
      : permisosBaseDeRol(clave.rolSugerido || 'funcionario')
  );
  document
    .querySelectorAll('#usuarioPermisos input[data-permiso]')
    .forEach((casilla) => {
      casilla.disabled = true;
    });
  actualizarPreviewClave();
}

export function valoresUsuarioForm() {
  const valorRol = $('usuarioRol')?.value || 'funcionario';
  const propio = valorRol.startsWith('propio:')
    ? (moduleState.rolesPropios || []).find((r) => r.id === valorRol.slice('propio:'.length))
    : null;
  const usos = $('usuarioClaveUsos')?.value || '';
  const id = $('usuarioId').value.trim() || null;
  return {
    id,
    claveId: id ? null : $('usuarioClaveAcceso')?.value || null,
    username: $('usuarioUsername').value.trim(),
    nombre: $('usuarioNombre').value.trim(),
    rol: propio?.rolPlantilla || valorRol,
    rolPropioId: propio?.id || null,
    municipios: moduleState.selectorTerritorio?.municipios() ?? [],
    estados: moduleState.selectorTerritorio?.estados() ?? [],
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

/** Agrega la clave recién creada al listado sin esperar la recarga completa. */
export function agregarClaveLista(clave) {
  if (!clave?.id) return;
  moduleState.claves = [
    clave,
    ...(moduleState.claves || []).filter((c) => c.id !== clave.id)
  ];
  renderClaves(moduleState.claves, moduleState.municipiosClaves || []);
}

export function renderClaves(claves = [], municipios = [], { puedeEliminar = true, puedeEditar = true } = {}) {
  const contenedor = $('clavesLista');
  if (!contenedor) return;
  moduleState.claves = claves;
  moduleState.municipiosClaves = municipios;
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
                <div class="campo-nota">${esc(c.rolSugerido || 'Sin rol sugerido')}${
                  Array.isArray(c.permisos)
                    ? ` · ${c.permisos.length} permiso(s)`
                    : ' · sin recorte de permisos'
                }</div>
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
                ${
                  puedeEditar
                    ? `<button class="btn btn-sm btn-outline" data-action="${
                        c.configuracionPendiente ? 'claves:completar' : 'claves:renovar'
                      }" data-id="${esc(c.id)}" title="${
                        c.configuracionPendiente
                          ? 'Completar cupo y vencimiento'
                          : 'Extender el vencimiento de la clave'
                      }">
                         <i class="bi bi-arrow-repeat"></i> ${
                           c.configuracionPendiente ? 'Completar' : 'Renovar'
                         }
                       </button>`
                    : ''
                }
                ${
                  puedeEliminar
                    ? `<button class="btn btn-sm btn-outline" data-action="claves:eliminar" data-id="${esc(c.id)}" title="Eliminar clave y cerrar sus sesiones">
                         <i class="bi bi-trash"></i> Eliminar
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

export function prepararModalRenovarClave({ clave = {}, modo = 'renovar', solicitud = null } = {}) {
  moduleState.claveRenovar = { clave, modo, solicitud };
  const completar = modo === 'completar';
  const solicitudRenovacion = modo === 'solicitud';
  if ($('renovarClaveTitulo')) {
    $('renovarClaveTitulo').textContent = completar
      ? 'Completar clave'
      : solicitudRenovacion
        ? 'Aprobar renovación'
        : 'Renovar clave';
  }
  if ($('renovarClaveResumen')) {
    $('renovarClaveResumen').textContent = solicitudRenovacion
      ? `Solicitud de ${solicitud?.solicitadoPor || 'una cuenta'} para la clave «${
          clave.nombre || clave.codigo || '—'
        }». ${solicitud?.motivo ? `Motivo: ${solicitud.motivo}` : ''}`
      : `Clave «${clave.nombre || clave.codigo || '—'}» · ${
          (clave.usuariosVinculados || []).length
        } cuenta(s) vinculada(s) · cupo actual ${clave.usosMaximos ?? 'sin definir'}.`;
  }
  if ($('renovarClaveExpira')) $('renovarClaveExpira').value = '';
  if ($('renovarClaveCupo')) {
    $('renovarClaveCupo').value = clave.usosMaximos ?? Math.max(1, Number(clave.usos || 0));
  }
  $('renovarClaveCupoBox')?.classList.toggle('u-oculto', solicitudRenovacion);
  if ($('renovarClaveNota')) {
    $('renovarClaveNota').textContent = completar
      ? 'Completa el cupo y el vencimiento. Hasta completarlos, la clave no puede asignarse a nuevas cuentas.'
      : solicitudRenovacion
        ? 'Al aprobar, la clave y todas sus cuentas vinculadas quedarán vigentes hasta la nueva fecha.'
        : 'La clave y sus cuentas vinculadas quedarán vigentes hasta la nueva fecha. El código no cambia.';
  }
}

export function valoresRenovarClave() {
  return {
    id:
      moduleState.claveRenovar?.clave?.id ||
      moduleState.claveRenovar?.solicitud?.claveId ||
      null,
    modo: moduleState.claveRenovar?.modo || 'renovar',
    solicitudId: moduleState.claveRenovar?.solicitud?.id || null,
    expiraEn: $('renovarClaveExpira')?.value || null,
    usosMaximos: $('renovarClaveCupo')?.value ? Number($('renovarClaveCupo').value) : null
  };
}

/** Lista de solicitudes de renovación que esperan a la administración. */
export function renderRenovacionesClave(solicitudes = []) {
  const caja = $('renovacionesClaveBox');
  const contenedor = $('renovacionesClaveLista');
  if (!caja || !contenedor) return;
  moduleState.renovacionesClave = solicitudes;
  caja.classList.toggle('u-oculto', !solicitudes.length);
  if (!solicitudes.length) {
    contenedor.innerHTML = '';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Cuenta</th><th>Clave</th><th>Motivo</th><th>Solicitada</th><th></th></tr></thead>
        <tbody>
          ${solicitudes
            .map(
              (s) => `<tr>
                <td><strong>${esc(s.solicitadoPor || '—')}</strong></td>
                <td class="u-fs-11px">${esc(s.clave?.nombre || s.claveId || '—')}${
                  s.clave?.expiraEn
                    ? `<div class="campo-nota">vence ${fmtFechaCorta(s.clave.expiraEn)}</div>`
                    : ''
                }</td>
                <td class="u-fs-12px">${esc(s.motivo || '—')}</td>
                <td class="u-fs-11px">${esc(fmtFechaCorta(s.creadoEn))}</td>
                <td class="u-acciones-tabla">
                  <button class="btn btn-success btn-sm" data-action="claves:renovacionAprobar" data-id="${esc(s.id)}">Aprobar</button>
                  <button class="btn btn-outline btn-sm" data-action="claves:renovacionRechazar" data-id="${esc(s.id)}">Rechazar</button>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

export function renovacionClavePorId(id) {
  return (moduleState.renovacionesClave || []).find((s) => String(s.id) === String(id)) || null;
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

/** Pinta el estado de la clave de activación de una cuenta. */
export function mostrarEstadoClaveUsuario({ cuenta = {}, clave = {} } = {}) {
  const nombre = $('claveUsuarioNombre');
  if (nombre) {
    nombre.textContent = `${cuenta.nombre || cuenta.username || 'la cuenta'} (${cuenta.username || '—'})`;
  }
  const boton = $('btnRenovarClaveUsuario');
  if (boton) boton.dataset.id = cuenta.id || '';

  const estado = $('claveUsuarioEstado');
  if (!estado) return;
  if (!clave) {
    estado.innerHTML =
      '<p>Esta cuenta no tiene una clave de activación asignada. Puedes generar una nueva.</p>';
    return;
  }

  const partes = [
    `<p><strong>Código:</strong> <code>${esc(clave.codigo || '—')}</code></p>`,
    `<p><strong>Modo:</strong> ${
      clave.modo === 'unica' ? 'Único por cuenta' : 'Compartido'
    }</p>`,
    `<p><strong>Estado:</strong> ${clave.activa === false ? 'Revocada' : 'Activa'} · ${
      clave.usos || 0
    } de ${clave.usosMaximos ?? '∞'} usos</p>`
  ];
  if (clave.expiraEn) {
    partes.push(`<p><strong>Vence:</strong> ${fmtFechaCorta(clave.expiraEn)}</p>`);
  }
  if (cuenta.claveVigenteHasta) {
    partes.push(
      `<p><strong>Cuenta activa hasta:</strong> ${fmtFechaCorta(cuenta.claveVigenteHasta)}</p>`
    );
  }
  if (clave.activadaEn) {
    partes.push(`<p><strong>Activada:</strong> ${fmtFechaCorta(clave.activadaEn)}</p>`);
  }
  estado.innerHTML = partes.join('');
}

/* ------------------- contraseña consultable (V2.11) --------------------- */

/** Pinta el modal de contraseña. El texto queda difuminado hasta pulsar «Mostrar». */
export function mostrarPasswordUsuario({ usuario = {}, password = '', generada = false, extra = '' } = {}) {
  moduleState.passwordUsuario = { usuario, password };
  const nombre = $('passwordUsuarioNombre');
  if (nombre) nombre.textContent = `la cuenta de ${usuario.nombre || usuario.username || ''}`;
  const texto = $('passwordUsuarioTexto');
  if (texto) {
    texto.textContent = password || '—';
    texto.classList.add('password-oculta');
    texto.dataset.action = 'password:alternar';
  }
  const etiqueta = $('passwordUsuarioVerTexto');
  if (etiqueta) etiqueta.textContent = 'Mostrar';
  const nota = $('passwordUsuarioNota');
  if (nota) {
    const base = generada
      ? 'Esta contraseña temporal se generó ahora. Entrégala en mano: también queda guardada cifrada y su consulta se audita.'
      : 'La consulta quedó registrada en auditoría. La contraseña se guarda cifrada; el acceso se sigue validando con bcrypt.';
    nota.textContent = extra ? `${base} ${extra}` : base;
  }
}

/** Alterna el difuminado del texto de la contraseña. */
export function alternarPasswordVisible(visible = null) {
  const texto = $('passwordUsuarioTexto');
  if (!texto) return false;
  const mostrar = visible === null ? texto.classList.contains('password-oculta') : visible;
  texto.classList.toggle('password-oculta', !mostrar);
  const etiqueta = $('passwordUsuarioVerTexto');
  if (etiqueta) etiqueta.textContent = mostrar ? 'Ocultar' : 'Mostrar';
  return mostrar;
}

/** Contraseña en claro del modal (para copiarla). */
export function passwordVisibleTexto() {
  const texto = $('passwordUsuarioTexto');
  if (!texto || texto.classList.contains('password-oculta')) return '';
  return texto.textContent?.trim() || '';
}

/** Cuenta que se está consultando en el modal de contraseña. */
export function passwordUsuarioActual() {
  return moduleState.passwordUsuario?.usuario || null;
}

/* ----------------------- ayuda de cada permiso ------------------------- */

/** Pinta la explicación de un permiso en el modal de ayuda. */
export function renderAyudaPermiso(permiso) {
  const titulo = $('ayudaPermisoTitulo');
  const contenido = $('ayudaPermisoContenido');
  if (!titulo || !contenido) return;
  const ayuda = PERMISOS_AYUDA[permiso] || {};
  titulo.textContent = ayuda.etiqueta || ETIQUETAS_PERMISO[permiso] || permiso;
  contenido.innerHTML = `
    <p class="u-lh-15">${esc(ayuda.quePermite || 'Sin descripción disponible.')}</p>
    ${ayuda.queBloquea ? `<p class="campo-nota"><strong>Qué bloquea:</strong> ${esc(ayuda.queBloquea)}</p>` : ''}
    ${ayuda.ejemplo ? `<p class="campo-nota"><strong>Ejemplo:</strong> ${esc(ayuda.ejemplo)}</p>` : ''}
    ${ayuda.riesgo ? `<p class="campo-nota"><strong>Riesgo:</strong> ${esc(ayuda.riesgo)}</p>` : ''}
    <p class="campo-nota">Clave técnica: <code>${esc(permiso)}</code>${
      ayuda.modulo ? ` · Guía: <strong>${esc(ayuda.modulo)}</strong>` : ''
    }</p>`;
}

export function prepararModalClave(municipios = [], estados = []) {
  $('claveNombre').value = '';
  $('claveRol').value = 'funcionario';
  $('claveUsos').value = '';
  $('claveExpira').value = '';
  renderPermisosClave('funcionario');
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
    // La matriz de la clave define qué podrá hacer quien entre con ella.
    permisos: leerPermisosClave(),
    municipios,
    estados,
    usosMaximos: $('claveUsos').value ? Number($('claveUsos').value) : null,
    expiraEn: $('claveExpira').value || null
  };
}

/* --------------------------- avisos por clave --------------------------- */

function resumenAvisosClave(clave = {}) {
  const notificaciones = clave.notificaciones || { activo: true, municipios: [] };
  if (notificaciones.activo === false) return 'Revocados';
  const total = (notificaciones.municipios || []).length;
  return total ? `${total} municipio(s)` : 'Todo el territorio';
}

export function renderAvisosClave(claves = [], municipios = []) {
  const contenedor = $('avisosClaveLista');
  if (!contenedor) return;
  moduleState.claves = claves;
  moduleState.municipiosClaves = municipios;
  const texto = normalizarBusqueda($('avisosClaveBuscar')?.value);
  const visibles = texto
    ? claves.filter((clave) =>
        normalizarBusqueda(
          `${clave.nombre} ${clave.codigo} ${(clave.estados || []).join(' ')} ${(clave.municipios || [])
            .map((id) => nombreMunicipio(municipios, id))
            .join(' ')}`
        ).includes(texto)
      )
    : claves;
  if (!visibles.length) {
    contenedor.innerHTML =
      '<p class="u-fs-12px u-suave">No hay claves que coincidan. Genera una en «Claves de acceso».</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Clave</th><th>Territorio de la clave</th><th>Avisos</th><th>Alcance de avisos</th><th></th></tr></thead>
        <tbody>
          ${visibles
            .map((clave) => {
              const notificaciones = clave.notificaciones || { activo: true, municipios: [] };
              const activos = notificaciones.activo !== false;
              const territorios = (clave.estados || []).length
                ? clave.estados.join(', ')
                : (clave.municipios || [])
                    .map((id) => nombreMunicipio(municipios, id))
                    .slice(0, 4)
                    .join(', ') + ((clave.municipios || []).length > 4 ? '…' : '');
              return `
            <tr>
              <td><code class="u-fs-11px">${esc(clave.codigo)}</code><div class="campo-nota">${esc(clave.nombre)}</div></td>
              <td class="u-fs-11px">${esc(territorios || '—')}</td>
              <td><span class="inc-badge badge-${activos ? 'verde' : 'rojo'}">${activos ? 'Activos' : 'Revocados'}</span></td>
              <td class="u-fs-11px">${esc(resumenAvisosClave(clave))}</td>
              <td class="u-acciones-tabla">
                <button class="btn btn-outline btn-sm" data-action="avisosClave:abrir" data-id="${esc(clave.id)}" title="Configurar avisos"><i class="bi bi-sliders"></i> Configurar</button>
                ${
                  activos
                    ? `<button class="btn btn-danger btn-sm" data-action="avisosClave:revocar" data-id="${esc(clave.id)}" title="Revocar avisos sin invalidar la clave"><i class="bi bi-bell-slash"></i> Revocar</button>`
                    : `<button class="btn btn-success btn-sm" data-action="avisosClave:reactivar" data-id="${esc(clave.id)}" title="Reactivar avisos"><i class="bi bi-bell"></i> Reactivar</button>`
                }
              </td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

export function prepararModalAvisosClave(clave = {}, municipios = []) {
  moduleState.claveAvisos = clave;
  $('avisosClaveId').value = clave.id || '';
  const titulo = $('avisosClaveTitulo');
  if (titulo) titulo.textContent = `Avisos · ${clave.nombre || clave.codigo || 'clave'}`;
  const nota = $('avisosClaveNota');
  if (nota) {
    nota.textContent = `${clave.codigo || ''} · ${clave.nombre || ''}. Elige los municipios donde esta clave puede recibir notificaciones.`;
  }
  const activo = $('avisosClaveActivo');
  if (activo) activo.checked = clave.notificaciones?.activo !== false;
  const ids = new Set((clave.municipios || []).map(String));
  const catalogo = municipios.filter((m) => ids.has(String(m.id)));
  moduleState.selectorAvisosClave = crearSelectorTerritorial({
    contenedor: 'avisosClaveTerritorio',
    municipios: catalogo,
    seleccionados: clave.notificaciones?.municipios || [],
    modo: 'municipios'
  });
}

export function valoresAvisosClave() {
  return {
    activo: $('avisosClaveActivo')?.checked !== false,
    municipios: moduleState.selectorAvisosClave?.municipios() || []
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

const ETIQUETA_METODO = { POST: 'Alta', PUT: 'Reemplazo', PATCH: 'Cambio', DELETE: 'Baja' };

export function renderAuditoria(registros = [], filtros = {}) {
  const contenedor = $('auditoriaLista');
  const resumen = $('auditoriaResumen');
  if (resumen) {
    const partes = [`${registros.length} registro(s)`];
    if (filtros.desde) partes.push(`desde ${filtros.desde}`);
    if (filtros.hasta) partes.push(`hasta ${filtros.hasta}`);
    if (filtros.metodo) partes.push(`tipo ${ETIQUETA_METODO[filtros.metodo] || filtros.metodo}`);
    if (filtros.username) partes.push(`autor ${filtros.username}`);
    if (filtros.accion) partes.push(`acción ${filtros.accion}`);
    resumen.textContent = partes.join(' · ');
  }
  if (!contenedor) return;
  if (!registros.length) {
    contenedor.innerHTML =
      '<p class="u-fs-12px u-suave">No hay acciones registradas con esos filtros.</p>';
    return;
  }

  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Fecha</th><th>Actor</th><th>Tipo</th><th>Acción</th><th>Entidad</th><th>Resultado</th><th>Clave</th><th>Huella IP</th></tr></thead>
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
              <td class="u-fs-11px">${esc(ETIQUETA_METODO[r.metodo] || r.metodo || '—')}</td>
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
  moduleState.solicitudesAcceso = solicitudes;
  if (!solicitudes.length) {
    contenedor.innerHTML = '<p class="u-fs-12px u-suave">No hay solicitudes pendientes.</p>';
    return;
  }

  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Folio</th><th>Nombre</th><th>Correo</th><th>Rol sugerido</th><th>Municipios</th><th>Estados</th><th>Documentos</th><th>Acciones</th></tr></thead>
        <tbody>
          ${solicitudes
            .map(
              (s) => `
            <tr>
              <td class="u-fs-11px">${esc(s.folio)}</td>
              <td>
                ${esc(s.nombre)}
                ${
                  s.usuarioVinculado
                    ? `<div class="u-fs-11px u-verde-oscuro">Cuenta vinculada: ${esc(
                        s.usuarioVinculado.nombre || s.usuarioVinculado.username
                      )}</div>`
                    : ''
                }
              </td>
              <td class="u-fs-11px">${esc(s.correo)}</td>
              <td><span class="inc-badge badge-amarillo">${esc(
                s.rolSugerido || s.rolSolicitado || '—'
              )}</span></td>
              <td class="u-fs-11px">${
                (s.municipiosNombres || []).length
                  ? esc((s.municipiosNombres || []).join(', '))
                  : (s.estadosNombres || s.estados || []).length
                    ? 'Todo el estado'
                    : '—'
              }</td>
              <td class="u-fs-11px">${esc(
                (s.estadosNombres || s.estados || []).join(', ') || '—'
              )}</td>
              <td class="u-fs-11px">${
                (s.documentos || []).length
                  ? (s.documentos || [])
                      .map(
                        (documento) =>
                          `<a href="${esc(urlPrivada(documento.url))}" target="_blank" rel="noopener">${esc(documento.nombre || 'Documento')}</a>`
                      )
                      .join('<br>')
                  : '—'
              }</td>
              <td class="u-fila-env">
                <button class="btn btn-sm btn-primary" data-action="solicitudes:aprobar" data-id="${esc(s.id)}">Revisar y aprobar</button>
                <button class="btn btn-sm btn-outline" data-action="solicitudes:rechazar" data-id="${esc(s.id)}">Rechazar</button>
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

export function solicitudAccesoPorId(id) {
  return (moduleState.solicitudesAcceso || []).find((s) => String(s.id) === String(id)) || null;
}

export function solicitudAltaPorId(id) {
  return (moduleState.solicitudesAlta || []).find((s) => String(s.id) === String(id)) || null;
}

function textoClaveAprobacion(clave = null) {
  if (!clave) return '';
  const territorio = (clave.estados || []).length
    ? `${(clave.estados || []).length} estado(s)`
    : `${(clave.municipios || []).length} municipio(s)`;
  return `Clave «${clave.nombre || clave.codigo}»: ${territorio}, cupo ${Number(
    clave.usos || 0
  )}/${clave.usosMaximos}, vence el ${String(clave.expiraEn || '').slice(0, 10) || 'sin fecha'}.`;
}

/**
 * Prepara el modal de aprobación. La cuenta solo puede aprobarse si queda
 * vinculada a una clave existente con cupo o a una clave nueva con vencimiento.
 */
export function prepararModalAprobacion({ tipo, solicitud, claves = [], resumen = '' } = {}) {
  moduleState.aprobacion = { tipo, solicitud };
  moduleState.clavesAprobacion = (claves || []).filter(
    (clave) => claveEstaVigente(clave) && clave.modo !== 'unica'
  );
  const esAcceso = tipo === 'acceso';
  const rolInicial =
    (esAcceso && (solicitud?.rolSugerido || solicitud?.rolSolicitado)) || 'funcionario';
  $('aprobarRolBox')?.classList.toggle('u-oculto', !esAcceso);
  if ($('aprobarRol')) $('aprobarRol').value = rolInicial;
  if ($('aprobarSolicitudResumen')) {
    $('aprobarSolicitudResumen').textContent =
      resumen || 'La cuenta se creará vinculada a la clave que elijas.';
  }
  if ($('aprobarClaveExpira')) $('aprobarClaveExpira').value = '';
  actualizarRolAprobacion();
}

/** Reconstruye las claves compatibles cuando cambia el rol elegido. */
export function actualizarRolAprobacion() {
  const esAcceso = moduleState.aprobacion?.tipo === 'acceso';
  const rol = esAcceso ? $('aprobarRol')?.value || 'funcionario' : 'funcionario';
  const compatibles = (moduleState.clavesAprobacion || []).filter(
    (clave) => clave.modo !== 'unica' && (!clave.rolSugerido || clave.rolSugerido === rol)
  );
  moduleState.clavesUsuario = compatibles;
  const selector = $('aprobarClaveSelect');
  if (selector) {
    selector.innerHTML =
      '<option value="">— Elegir una clave existente —</option>' +
      compatibles
        .map(
          (clave) =>
            `<option value="${esc(clave.id)}">${esc(clave.nombre || clave.codigo)} · ${esc(
              clave.rolSugerido || 'sin rol'
            )} · cupo ${esc(`${Number(clave.usos || 0)}/${clave.usosMaximos}`)}</option>`
        )
        .join('');
  }
  if ($('aprobarGenerarClave')) $('aprobarGenerarClave').checked = compatibles.length === 0;
  actualizarAprobacionClave();
}

export function actualizarAprobacionClave() {
  const generar = $('aprobarGenerarClave')?.checked === true;
  $('aprobarClaveNuevaOpciones')?.classList.toggle('u-oculto', !generar);
  const nota = $('aprobarClavePreview');
  if (!nota) return;
  if (generar) {
    nota.textContent =
      'Se generará una clave nueva, exclusiva de esta cuenta (cupo 1), con el territorio y los permisos de la cuenta. Indica su vencimiento.';
    return;
  }
  const id = $('aprobarClaveSelect')?.value || '';
  const clave = (moduleState.clavesUsuario || []).find((c) => String(c.id) === String(id));
  nota.textContent = clave
    ? textoClaveAprobacion(clave)
    : 'Elige una clave existente o marca «Generar una clave nueva». Sin clave la cuenta no podrá entrar.';
}

export function valoresAprobacion() {
  const generar = $('aprobarGenerarClave')?.checked === true;
  const esAcceso = moduleState.aprobacion?.tipo === 'acceso';
  return {
    tipo: moduleState.aprobacion?.tipo || null,
    id: moduleState.aprobacion?.solicitud?.id || null,
    rol: esAcceso ? $('aprobarRol')?.value || 'funcionario' : null,
    claveId: generar ? null : $('aprobarClaveSelect')?.value || null,
    generarClave: generar,
    claveExpiraEn: generar ? $('aprobarClaveExpira')?.value || null : null
  };
}

/* ------------------- reportes de conversación (V2.11.4) ------------------ */

const ESTADO_REPORTE_CONV = {
  pendiente: 'amarillo',
  resuelto: 'verde',
  descartado: 'gris',
  revertido: 'azul'
};

const MEDIDA_REPORTE_CONV = {
  suspender_mensajes: 'Envío de mensajes restringido',
  suspender_cuenta: 'Cuenta suspendida',
  baja_cuenta: 'Cuenta dada de baja',
  descartar: 'Sin sanción'
};

/** Cola de reportes de conversación (moderación). */
export function renderReportesConversacion(reportes = [], { puedeResolver = false } = {}) {
  const contenedor = $('reportesConvLista');
  if (!contenedor) return;
  if (!reportes.length) {
    contenedor.innerHTML =
      '<p class="campo-nota">No hay reportes de conversación pendientes ni recientes.</p>';
    return;
  }
  const motivos = store.estado.catalogos?.motivosDenuncia || {};
  contenedor.innerHTML = reportes
    .map((r) => {
      const mensajes = (r.mensajes || [])
        .map(
          (m) => `<div class="bandeja-reporte-mensaje">
            <div class="bandeja-mensaje-meta">${esc(m.nombre || m.de)} · ${esc(fmtFechaCorta(m.fecha))}</div>
            ${m.cuerpo ? `<div class="bandeja-mensaje-cuerpo">${esc(m.cuerpo)}</div>` : ''}
            ${
              (m.adjuntos || []).length
                ? `<div class="campo-nota">${m.adjuntos
                    .map((a) => `📎 ${esc(a.nombre)}`)
                    .join(' · ')}</div>`
                : ''
            }
          </div>`
        )
        .join('');
      return `<article class="reporte-conv-card">
        <div class="reporte-conv-cabecera">
          <div>
            <strong>${esc(r.autorNombre || r.autorUsername)}</strong> reportó a
            <strong>${esc(r.objetivoNombre || r.objetivoUsername)}</strong>
            <div class="campo-nota">
              ${esc(r.canal === 'directo' ? 'Contacto directo' : 'Mensaje interno')}
              · ${esc(r.conversacionAsunto || 'Conversación')}
              · ${esc(fmtFechaCorta(r.fecha))}
            </div>
          </div>
          <span class="inc-badge badge-${ESTADO_REPORTE_CONV[r.estado] || 'gris'}">${esc(r.estado)}</span>
        </div>
        <p><strong>Motivo:</strong> ${esc(motivos[r.motivo] || r.motivo)}</p>
        <p>${esc(r.detalle)}</p>
        ${
          r.incluyeMensajes === false
            ? '<p class="campo-nota"><strong>Sin mensajes adjuntos:</strong> el autor decidió no enviarlos; la decisión se basa solo en la descripción.</p>'
            : ''
        }
        <details class="reporte-conv-detalle">
          <summary>${
            (r.mensajes || []).length
              ? `Ver los últimos mensajes adjuntos (${(r.mensajes || []).length})`
              : 'No se adjuntaron mensajes'
          }</summary>
          ${mensajes || '<p class="campo-nota">Sin mensajes.</p>'}
        </details>
        ${
          r.accion
            ? `<p class="campo-nota"><strong>Medida:</strong> ${esc(
                MEDIDA_REPORTE_CONV[r.accion] || r.accion
              )}${r.resueltoPor ? ` · ${esc(r.resueltoPor)}` : ''}</p>`
            : ''
        }
        ${r.resolucion ? `<p class="campo-nota"><strong>Resolución:</strong> ${esc(r.resolucion)}</p>` : ''}
        ${
          r.revertidoPor
            ? `<p class="campo-nota"><strong>Revertida por</strong> ${esc(r.revertidoPor)}</p>`
            : ''
        }
        <div class="u-fila-env">
          <button class="btn btn-sm btn-outline" data-action="reporteConv:ver" data-id="${esc(
            r.id
          )}"><i class="bi bi-chat-left-quote"></i> Ver conversación</button>
          ${
            puedeResolver && r.estado === 'pendiente'
              ? `<button class="btn btn-sm btn-danger" data-action="reporteConv:resolver" data-valor="suspender_mensajes" data-id="${esc(
                  r.id
                )}"><i class="bi bi-slash-circle"></i> Restringir mensajes</button>
              <button class="btn btn-sm btn-outline" data-action="reporteConv:resolver" data-valor="descartar" data-id="${esc(
                  r.id
                )}"><i class="bi bi-shield-check"></i> Resolver</button>`
              : ''
          }
          ${
            puedeResolver && r.estado === 'resuelto' && r.sancion
              ? `<button class="btn btn-sm btn-outline" data-action="reporteConv:revertir" data-id="${esc(
                  r.id
                )}"><i class="bi bi-arrow-counterclockwise"></i> Revertir medida</button>`
              : ''
          }
        </div>
      </article>`;
    })
    .join('');
}

/* ---------------------- reclamaciones y archivo -------------------------- */

const ETIQUETAS_RECLAMACION = {
  pendiente: 'amarillo',
  en_revision: 'naranja',
  resuelta: 'verde',
  rechazada: 'gris'
};

/** Reclamaciones de incidencias resueltas. */
export function renderReclamaciones(reclamaciones = []) {
  const contenedor = $('reclamacionesLista');
  if (!contenedor) return;
  if (!reclamaciones.length) {
    contenedor.innerHTML = '<p class="campo-nota">No hay reclamaciones con ese estado.</p>';
    return;
  }
  contenedor.innerHTML = reclamaciones
    .map(
      (r) => `<article class="reporte-conv-card">
        <div class="reporte-conv-cabecera">
          <div>
            <strong>${esc(r.incidenciaTitulo || 'Incidencia')}</strong>
            <div class="campo-nota">
              ${esc(r.nombre || r.username || 'Cuenta')} · ${esc(fmtFechaCorta(r.creadoEn))}
              ${r.delegadoA ? ` · Delegada a ${esc(r.delegadoA)}` : ''}
            </div>
          </div>
          <span class="inc-badge badge-${ETIQUETAS_RECLAMACION[r.estado] || 'gris'}">${esc(
            r.estado
          )}</span>
        </div>
        <p>${esc(r.detalle)}</p>
        ${r.respuesta ? `<p class="campo-nota"><strong>Respuesta:</strong> ${esc(r.respuesta)}</p>` : ''}
        <div class="u-fila-env">
          <button class="btn btn-sm btn-outline" data-action="reclamacion:ver" data-id="${esc(
            r.id
          )}"><i class="bi bi-eye"></i> Ver y decidir</button>
          <button class="btn btn-sm btn-outline" data-action="reclamacion:informe" data-id="${esc(
            r.id
          )}"><i class="bi bi-filetype-pdf"></i> Informe</button>
        </div>
      </article>`
    )
    .join('');
}

/** Archivo: incidencias resueltas agrupadas por mes y día. */
export function renderArchivo(datos = {}, filtros = {}) {
  const contenedor = $('archivoCarpetas');
  if (!contenedor) return;
  const carpetas = Array.isArray(datos.carpetas) ? datos.carpetas : [];
  const resumen = datos.resumen || {};
  const cajaResumen = $('archivoResumen');
  if (cajaResumen) {
    cajaResumen.textContent = resumen.total
      ? `${resumen.total} incidencia(s) en ${resumen.carpetas || carpetas.length} carpeta(s) · Costo registrado: ${dinero(
          resumen.costoTotal
        )}${filtros.desde || filtros.hasta ? ' · Filtro por fecha activo' : ''}`
      : 'Aún no hay incidencias archivadas (pasan al archivo un día después de resolverse).';
  }
  if (!carpetas.length) {
    contenedor.innerHTML =
      '<div class="empty-state"><i class="bi bi-archive"></i><p>No hay expedientes para los filtros elegidos.</p></div>';
    return;
  }
  contenedor.innerHTML = carpetas
    .map(
      (mes, indiceMes) => `
      <details class="archivo-mes" ${indiceMes === 0 ? 'open' : ''}>
        <summary class="archivo-mes-titulo">
          <span><i class="bi bi-folder2-open"></i> ${esc(mes.etiqueta)}</span>
          <span class="u-suave u-fs-12px">${mes.total} incidencia(s) · ${dinero(mes.costoTotal)}</span>
        </summary>
        <div class="archivo-dias">
          ${(mes.dias || [])
            .map(
              (dia) => `
            <details class="archivo-dia" open>
              <summary class="archivo-dia-titulo">
                <span><i class="bi bi-calendar3"></i> ${esc(dia.etiqueta)}</span>
                <span class="u-suave u-fs-12px">${dia.total} · ${dinero(dia.costoTotal)}</span>
              </summary>
              <div class="u-scroll-x">
                <table class="data-table">
                  <thead>
                    <tr><th>Folio</th><th>Título</th><th>Tipo</th><th>Reparación</th><th>Costo</th><th>Documentos</th><th></th></tr>
                  </thead>
                  <tbody>
                    ${(dia.incidencias || [])
                      .map(
                        (incidencia) => `<tr>
                          <td class="u-fs-11px">${esc(incidencia.folio || '—')}</td>
                          <td>${esc(incidencia.titulo)}</td>
                          <td>${esc(incidencia.tipoNombre || '—')}</td>
                          <td class="u-fs-11px u-capitalizar">${esc(
                            String(incidencia.reparacionEstado || 'sin_asignar').replaceAll('_', ' ')
                          )}</td>
                          <td class="u-fs-11px">${dinero(incidencia.costoReparacion)}</td>
                          <td class="u-fs-11px">${incidencia.documentos || 0}</td>
                          <td class="archivo-acciones">
                            <button class="btn btn-sm btn-outline" data-action="admin:verDetalle" data-id="${esc(
                              incidencia.id
                            )}"><i class="bi bi-eye"></i> Ver</button>
                            <button class="btn btn-sm btn-outline" data-action="archivo:expediente" data-id="${esc(
                              incidencia.id
                            )}"><i class="bi bi-filetype-json"></i> Expediente</button>
                            <button class="btn btn-sm btn-outline" data-action="archivo:pdf" data-id="${esc(
                              incidencia.id
                            )}"><i class="bi bi-filetype-pdf"></i> PDF</button>
                          </td>
                        </tr>`
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </details>`
            )
            .join('')}
        </div>
      </details>`
    )
    .join('');
}

function dinero(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
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
  cuadrilla: 'Cuadrillas de campo',
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

