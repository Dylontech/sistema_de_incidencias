/** Vista del directorio de correos institucionales. */
import { $, esc, fmtFecha } from '../core/utils.js';

export function renderEstados(municipios = [], activo = '') {
  const selector = $('correosEstado');
  if (!selector) return;
  const estados = [...new Set(municipios.map((m) => m.estado).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
  selector.innerHTML =
    '<option value="">Todos</option>' +
    estados
      .map(
        (estado) =>
          `<option value="${esc(estado)}" ${estado === activo ? 'selected' : ''}>${esc(
            estado
          )}</option>`
      )
      .join('');
}

export function renderMunicipios(municipios = [], activo = '') {
  const selector = $('correosMunicipio');
  if (!selector) return;
  selector.innerHTML =
    '<option value="">Todos los municipios</option>' +
    municipios
      .map(
        (m) =>
          `<option value="${esc(m.id)}" ${m.id === activo ? 'selected' : ''}>${esc(
            m.nombre
          )} — ${esc(m.estado)}</option>`
      )
      .join('');
}

export function renderLista(correos = [], { total = 0, pagina = 1, limite = 50 } = {}) {
  const contenedor = $('correosLista');
  if (!contenedor) return;
  if (!correos.length) {
    contenedor.innerHTML =
      '<tr><td colspan="6" class="celda-vacia">No hay correos registrados con esos filtros.</td></tr>';
  } else {
    contenedor.innerHTML = correos
      .map(
        (c) => `<tr>
          <td><strong>${esc(c.correo)}</strong><div class="campo-nota">${esc(
            c.dependencia || 'Sin dependencia'
          )}</div></td>
          <td>${esc(c.estado)}<div class="campo-nota">${esc(c.municipioId || 'Estatal')}</div></td>
          <td>${esc(c.cargo || '—')}</td>
          <td><span class="inc-badge badge-${c.verificado ? 'verde' : 'amarillo'}">${
            c.verificado ? 'Verificado' : 'Por verificar'
          }</span></td>
          <td>${c.invitadoEn ? fmtFecha(c.invitadoEn) : '—'}</td>
          <td class="u-acciones-tabla">
            <button class="btn btn-outline btn-sm" data-action="correos:editar" data-id="${esc(
              c.id
            )}" aria-label="Editar correo" title="Editar"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline btn-sm" data-action="correos:invitar-uno" data-id="${esc(
              c.id
            )}" aria-label="Invitar correo" title="Invitar"><i class="bi bi-envelope"></i></button>
            ${c.verificado && c.municipioId ? `<button class="btn btn-outline btn-sm" data-action="correos:asignarClave" data-id="${esc(
              c.id
            )}" aria-label="Asignar a la clave del municipio" title="Asignar a la clave del municipio"><i class="bi bi-key-fill"></i></button>` : ''}
            <button class="btn btn-danger btn-sm" data-action="correos:eliminar" data-id="${esc(
              c.id
            )}" aria-label="Eliminar correo" title="Eliminar"><i class="bi bi-trash3"></i></button>
          </td>
        </tr>`
      )
      .join('');
  }
  const paginacion = $('correosPaginacion');
  if (paginacion) {
    const paginas = Math.max(Math.ceil(total / limite), 1);
    paginacion.innerHTML = `
      <button class="btn btn-outline btn-sm" data-action="correos:pagina" data-valor="${
        pagina - 1
      }" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
      <span class="campo-nota">Página ${pagina} de ${paginas} · ${total} correos</span>
      <button class="btn btn-outline btn-sm" data-action="correos:pagina" data-valor="${
        pagina + 1
      }" ${pagina >= paginas ? 'disabled' : ''}>Siguiente →</button>`;
  }
}

export function renderBusquedas(datos = {}) {
  const contenedor = $('correosBusquedas');
  if (!contenedor) return;
  const consultas = datos.consultas || [];
  if (!consultas.length) {
    contenedor.innerHTML =
      '<p class="campo-nota">Elige un municipio para preparar búsquedas asistidas.</p>';
    return;
  }
  contenedor.innerHTML = consultas
    .map(
      (c) => `<div class="correo-busqueda">
        <span>${esc(c.consulta)}</span>
        <a href="${esc(c.google)}" target="_blank" rel="noopener">Google</a>
        <a href="${esc(c.bing)}" target="_blank" rel="noopener">Bing</a>
        <a href="${esc(c.duckduckgo)}" target="_blank" rel="noopener">DuckDuckGo</a>
      </div>`
    )
    .join('');
}

export function llenarFormulario(correo = null) {
  const valores = correo || {};
  const asignar = (id, valor) => {
    const campo = $(id);
    if (campo) campo.value = valor ?? '';
  };
  asignar('correoInstitucionalId', valores.id || '');
  asignar('correoInstitucionalCorreo', valores.correo || '');
  asignar('correoInstitucionalEstado', valores.estado || '');
  asignar('correoInstitucionalDependencia', valores.dependencia || '');
  asignar('correoInstitucionalCargo', valores.cargo || '');
  asignar('correoInstitucionalTelefono', valores.telefono || '');
  asignar('correoInstitucionalFuente', valores.fuenteUrl || '');
  asignar('correoInstitucionalNotas', valores.notas || '');
  const verificado = $('correoInstitucionalVerificado');
  if (verificado) verificado.checked = valores.verificado === true;
  const titulo = $('correoInstitucionalTitulo');
  if (titulo) titulo.textContent = valores.id ? 'Editar correo institucional' : 'Nuevo correo institucional';
  const municipio = $('correoInstitucionalMunicipio');
  if (municipio) municipio.value = valores.municipioId || '';
}
