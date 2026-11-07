/** Vista del simulador de acciones. */
import { $, esc, fmtFecha } from '../core/utils.js';

export function renderRoles(roles = [], activo = 'ciudadano') {
  const selector = $('simuladorRol');
  if (!selector) return;
  selector.innerHTML = roles
    .map(
      (rol) =>
        `<option value="${esc(rol.clave)}" ${rol.clave === activo ? 'selected' : ''}>${esc(
          rol.nombre
        )}</option>`
    )
    .join('');
}

export function renderMunicipios(municipios = [], activo = '') {
  const selector = $('simuladorMunicipio');
  if (!selector) return;
  selector.innerHTML = municipios
    .map(
      (m) =>
        `<option value="${esc(m.id)}" ${m.id === activo ? 'selected' : ''}>${esc(m.nombre)} — ${esc(
          m.estado
        )}</option>`
    )
    .join('');
}

function campoHtml(accion, campo) {
  const id = `simCampo_${accion.id}_${campo.nombre}`;
  const etiqueta = `<label for="${id}">${esc(campo.etiqueta)}</label>`;
  if (campo.tipo === 'textarea') {
    return `<div class="form-group">${etiqueta}<textarea id="${id}" rows="2" maxlength="2000">${esc(
      campo.defecto || ''
    )}</textarea></div>`;
  }
  if (campo.tipo === 'select') {
    return `<div class="form-group">${etiqueta}<select id="${id}">${(campo.opciones || [])
      .map(
        (opcion) =>
          `<option value="${esc(opcion.valor)}" ${
            opcion.valor === campo.defecto ? 'selected' : ''
          }>${esc(opcion.etiqueta)}</option>`
      )
      .join('')}</select></div>`;
  }
  return `<div class="form-group">${etiqueta}<input id="${id}" type="${esc(
    campo.tipo || 'text'
  )}" maxlength="300" autocomplete="off" value="${esc(campo.defecto || '')}"></div>`;
}

export function renderAcciones(acciones = []) {
  const contenedor = $('simuladorAcciones');
  if (!contenedor) return;
  if (!acciones.length) {
    contenedor.innerHTML =
      '<p class="campo-nota">Este rol no tiene acciones disponibles en el catálogo.</p>';
    return;
  }
  const secciones = new Map();
  for (const accion of acciones) {
    if (!secciones.has(accion.seccion)) secciones.set(accion.seccion, []);
    secciones.get(accion.seccion).push(accion);
  }
  contenedor.innerHTML = [...secciones.entries()]
    .map(
      ([seccion, lista]) => `
      <h4 class="titulo-seccion u-mt-10">${esc(seccion)}</h4>
      <div class="simulador-acciones">
        ${lista
          .map(
            (accion) => `
          <article class="panel-blanco simulador-accion">
            <div class="u-fila-sep">
              <strong>${esc(accion.titulo)}</strong>
              <span class="inc-badge badge-gris">${esc(accion.metodo)}</span>
            </div>
            <p class="campo-nota">${esc(accion.descripcion)}</p>
            <div class="simulador-cadena">
              <span>${esc(accion.endpoint)}</span>
              <span>Permiso: <code>${esc(accion.permiso)}</code></span>
              <span>Servicio: <code>${esc(accion.servicio)}</code></span>
              <span>Repositorio: <code>${esc(accion.repositorio)}</code></span>
              <span>Eventos: ${esc((accion.eventos || []).join(', ') || '—')}</span>
              <span>Correo: ${esc(accion.correo || 'No')}</span>
            </div>
            <div class="simulador-campos">
              ${(accion.campos || []).map((campo) => campoHtml(accion, campo)).join('')}
            </div>
            <button class="btn btn-primary btn-sm" data-action="simulador:ejecutar" data-id="${esc(
              accion.id
            )}">
              <i class="bi bi-play-fill"></i> Ejecutar acción
            </button>
          </article>`
          )
          .join('')}
      </div>`
    )
    .join('');
}

export function renderEstado(sesion = null) {
  const contenedor = $('simuladorEstado');
  if (!contenedor) return;
  if (!sesion) {
    contenedor.innerHTML = '';
    return;
  }
  const abierta = sesion.estado === 'abierta';
  const datos = sesion.datos || {};
  contenedor.innerHTML = `
    <div class="simulador-banner ${abierta ? '' : 'cerrada'}">
      <div>
        <strong>MODO SIMULACIÓN · ${esc(sesion.rolSimulado)}</strong>
        <div class="campo-nota">
          Municipio ${esc(datos.municipioNombre || sesion.municipioId || '—')} ·
          Cuenta ${esc(sesion.usuarioSimulado || 'anónima')} ·
          Estado ${esc(sesion.estado)}
        </div>
        ${datos.advertencia ? `<div class="publico-msg err">${esc(datos.advertencia)}</div>` : ''}
      </div>
      <div class="u-fila-sep">
        ${
          abierta
            ? `<button class="btn btn-outline btn-sm" data-action="simulador:cerrar" data-id="${esc(
                sesion.id
              )}"><i class="bi bi-stop-circle"></i> Cerrar</button>`
            : ''
        }
        <button class="btn btn-danger btn-sm" data-action="simulador:revertir" data-id="${esc(
          sesion.id
        )}"><i class="bi bi-arrow-counterclockwise"></i> Revertir todo</button>
      </div>
    </div>`;
}

export function renderJournal(operaciones = []) {
  const contenedor = $('simuladorJournal');
  if (!contenedor) return;
  if (!operaciones.length) {
    contenedor.innerHTML =
      '<p class="campo-nota">Todavía no hay operaciones en esta sesión.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>#</th><th>Acción</th><th>Entidad</th><th>Resultado</th><th>Fecha</th></tr></thead>
        <tbody>
          ${operaciones
            .map(
              (op) => `<tr>
                <td>${op.orden}</td>
                <td>${esc(op.accionId || '—')}</td>
                <td><code>${esc(op.entidadTipo)}</code><div class="campo-nota">${esc(
                  op.entidadId || ''
                )}</div></td>
                <td>${esc(JSON.stringify(op.despues || op.resultado || {}).slice(0, 180))}</td>
                <td>${fmtFecha(op.creadoEn)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

export function renderSesiones(sesiones = []) {
  const contenedor = $('simuladorSesiones');
  if (!contenedor) return;
  if (!sesiones.length) {
    contenedor.innerHTML = '<p class="campo-nota">Aún no hay sesiones de simulación.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Rol</th><th>Municipio</th><th>Estado</th><th>Creada</th><th>Acciones</th></tr></thead>
        <tbody>
          ${sesiones
            .map(
              (s) => `<tr>
                <td>${esc(s.rolSimulado)}</td>
                <td>${esc(s.datos?.municipioNombre || s.municipioId || '—')}</td>
                <td><span class="inc-badge badge-${
                  s.estado === 'abierta' ? 'amarillo' : s.estado === 'revertida' ? 'verde' : 'gris'
                }">${esc(s.estado)}</span></td>
                <td>${fmtFecha(s.creadaEn)}</td>
                <td class="u-acciones-tabla">
                  <button class="btn btn-outline btn-sm" data-action="simulador:ver" data-id="${esc(
                    s.id
                  )}" aria-label="Ver sesión" title="Ver sesión"><i class="bi bi-eye"></i></button>
                  ${
                    s.estado !== 'revertida'
                      ? `<button class="btn btn-danger btn-sm" data-action="simulador:revertir" data-id="${esc(
                          s.id
                        )}" aria-label="Revertir sesión" title="Revertir"><i class="bi bi-arrow-counterclockwise"></i></button>`
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
