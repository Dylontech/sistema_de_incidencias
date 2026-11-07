/** Vista del panel de reparaciones de campo. */
import { esc, fmtFechaCorta } from '../core/utils.js';

const ETIQUETAS = {
  sin_asignar: 'Sin asignar',
  asignada: 'Asignada',
  en_reparacion: 'En reparación',
  terminada: 'Terminada',
  validada: 'Validada'
};

const BADGES = {
  sin_asignar: 'badge-gris',
  asignada: 'badge-amarillo',
  en_reparacion: 'badge-naranja',
  terminada: 'badge-azul',
  validada: 'badge-verde'
};

function dinero(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '—';
  return numero.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function acciones(incidencia, usuario) {
  const esCoordinador =
    usuario?.rol === 'funcionario' ||
    ['admin', 'admin_estatal', 'admin_municipal'].includes(usuario?.rol) ||
    usuario?.permisos?.includes('coordinar_reparaciones');
  const estado = incidencia.reparacionEstado || 'sin_asignar';
  const botones = [
    `<button type="button" class="btn btn-outline btn-sm" data-action="detalle:abrir" data-id="${esc(
      incidencia.id
    )}"><i class="bi bi-eye"></i> Abrir</button>`,
    `<button type="button" class="btn btn-outline btn-sm" data-action="reparaciones:documentosAbrir" data-id="${esc(
      incidencia.id
    )}"><i class="bi bi-paperclip"></i> Documentos</button>`
  ];
  if (esCoordinador && estado !== 'validada') {
    botones.push(
      `<button type="button" class="btn btn-primary btn-sm" data-action="reparaciones:asignarAbrir" data-id="${esc(
        incidencia.id
      )}"><i class="bi bi-person-plus"></i> ${estado === 'sin_asignar' ? 'Asignar' : 'Reasignar'}</button>`
    );
  }
  if (['asignada', 'en_reparacion'].includes(estado)) {
    const destino = estado === 'asignada' ? 'en_reparacion' : 'terminada';
    botones.push(
      `<button type="button" class="btn btn-orange btn-sm" data-action="reparaciones:estado" data-id="${esc(
        incidencia.id
      )}" data-valor="${destino}"><i class="bi bi-play-fill"></i> ${
        destino === 'en_reparacion' ? 'Iniciar' : 'Terminar'
      }</button>`
    );
  }
  if (esCoordinador && estado === 'terminada') {
    botones.push(
      `<button type="button" class="btn btn-success btn-sm" data-action="reparaciones:estado" data-id="${esc(
        incidencia.id
      )}" data-valor="validada"><i class="bi bi-check2-circle"></i> Validar</button>`
    );
  }
  return botones.join('');
}

export function renderLista(contenedor, lista = [], usuario = {}) {
  if (!contenedor) return;
  if (!lista.length) {
    contenedor.innerHTML =
      '<div class="empty-state"><i class="bi bi-tools"></i><p>No hay reparaciones para mostrar.</p></div>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead>
          <tr>
            <th>Incidencia</th><th>Reparación</th><th>Cuadrilla</th>
            <th>Costo</th><th>Documentos</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${lista
            .map((incidencia) => {
              const estado = incidencia.reparacionEstado || 'sin_asignar';
              const docs = Array.isArray(incidencia.documentosReparacion)
                ? incidencia.documentosReparacion.length
                : 0;
              return `<tr>
                <td>
                  <strong>${esc(incidencia.titulo || 'Incidencia')}</strong>
                  <div class="campo-nota">${esc(incidencia.municipioNombre || incidencia.municipioId || '')} · ${esc(
                    incidencia.viaNombre || incidencia.zonaNombre || 'Sin vía'
                  )} · ${esc(fmtFechaCorta(incidencia.fecha))}</div>
                </td>
                <td><span class="inc-badge ${BADGES[estado] || 'badge-gris'}">${esc(
                  ETIQUETAS[estado] || estado
                )}</span></td>
                <td>${esc(incidencia.asignadaNombre || '—')}${
                  incidencia.asignadaEn ? `<div class="campo-nota">${esc(fmtFechaCorta(incidencia.asignadaEn))}</div>` : ''
                }</td>
                <td>${esc(dinero(incidencia.costoReparacion))}</td>
                <td>${docs ? `${docs} archivo(s)` : '—'}</td>
                <td class="u-acciones-tabla">${acciones(incidencia, usuario)}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

export function renderCuadrillas(select, lista = []) {
  if (!select) return;
  select.innerHTML = lista.length
    ? lista
        .map(
          (cuadrilla) =>
            `<option value="${esc(cuadrilla.id)}">${esc(cuadrilla.nombre || cuadrilla.username)}${
              cuadrilla.municipios?.length
                ? ` · ${cuadrilla.municipios.length} municipio(s)`
                : ''
            }</option>`
        )
        .join('')
    : '<option value="">No hay cuadrillas disponibles</option>';
}

export function renderDocumentos(contenedor, documentos = []) {
  if (!contenedor) return;
  if (!documentos.length) {
    contenedor.innerHTML = '<p class="campo-nota">Aún no hay documentos oficiales.</p>';
    return;
  }
  contenedor.innerHTML = `<ul class="pila-filas">${documentos
    .map(
      (documento) => `<li class="pila-fila">
        <a href="${esc(documento.url || '#')}" target="_blank" rel="noopener">
          <i class="bi bi-file-earmark-text"></i> ${esc(documento.nombre || 'Documento')}
        </a>
        <span class="campo-nota">${esc(documento.tipo || '')}</span>
      </li>`
    )
    .join('')}</ul>`;
}
