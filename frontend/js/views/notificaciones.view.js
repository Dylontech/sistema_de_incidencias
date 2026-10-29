/** Vista del panel de notificaciones y su contador. */
import { $, esc, fmtFecha } from '../core/utils.js';

const ICONOS = {
  incidencia_creada: '📍',
  incidencia_estado: '🔄',
  incidencia_resuelta: '🎉',
  incidencia_comentario: '💬',
  incidencia_peligro: '⚠️',
  incidencia_alerta: '🔴',
  sugerencia_creada: '💡',
  sugerencia_respondida: '💬',
  contacto_creado: '✉️',
  contacto_respondido: '📬',
  solicitud_acceso_creada: '🪪',
  solicitud_acceso_resuelta: '✅',
  solicitud_informe_creada: '📄',
  solicitud_informe_enviada: '📧',
  solicitud_informe_error: '⚠️',
  ticket_creado: '🎫',
  ticket_asignado: '🎯',
  ticket_respondido: '💬',
  ticket_cerrado: '✅',
  ticket_reabierto: '🔓',
  mensaje_directo: '💬',
  difusion_personal: '📣',
  moderacion_cuenta: '🚩',
  moderacion_contenido: '🛡️',
  clave_creada: '🔑',
  clave_revocada: '🚫',
  seguridad_alerta: '🚨',
  firma_agregada: '✍️',
  meta_firmas_alcanzada: '🎯',
  recoleccion_firmas_creada: '✍️',
  solicitud_firmas_admin: '📨',
  documento_firmas_enviado: '📄',
  limite_firmas_alcanzado: '⚠️',
  contacto_funcionario_creado: '✉️',
  contacto_funcionario_respondido: '💬',
  municipio_sin_funcionario: '🏛️',
  solicitud_funcionario_atendida: '✅',
  respaldo_creado: '💾',
  respaldo_error: '⚠️',
  respaldo_restaurado: '♻️',
  respaldo_eliminado: '🗑️',
  prueba_notificacion: '🔔',
  ficha_municipio_pendiente: '🏛️',
  ficha_municipio_aprobada: '✅',
  ficha_municipio_rechazada: '⚠️',
  permiso_solicitado: '🛡️',
  permiso_resuelto: '🔑'
};

const ICONOS_TIPO = {
  reporte: '✅',
  resuelta: '🎉',
  estado: '🔄',
  alerta: '⚠️',
  comentario: '💬',
  mensaje: '💬',
  contacto: '✉️',
  sugerencia: '💡',
  solicitud: '🎫'
};

function iconoDe(n) {
  return ICONOS[n.evento] || ICONOS_TIPO[n.tipo] || '🔔';
}

function claseSeveridad(n) {
  return n.severidad && n.severidad !== 'info' ? ` notif-sev-${esc(n.severidad)}` : '';
}

export function renderizarBadge(notificaciones = []) {
  const badge = $('notif-badge');
  if (!badge) return;
  const sinLeer = notificaciones.filter((n) => !n.leida).length;
  if (sinLeer > 0) {
    badge.textContent = sinLeer > 99 ? '99+' : String(sinLeer);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

export function renderizarPanel(notificaciones = []) {
  const contenedor = $('notifList');
  if (!contenedor) return;

  if (!notificaciones.length) {
    contenedor.innerHTML =
      '<div class="notif-empty"><i class="bi bi-bell-slash icono-vacio"></i>Sin notificaciones</div>';
    return;
  }

  contenedor.innerHTML = notificaciones
    .map(
      (n) => `
    <div class="notif-item ${n.leida ? '' : 'unread'}${claseSeveridad(n)}">
      <div class="n-icon">${iconoDe(n)}</div>
      <div class="n-content u-cursor" data-action="notificaciones:abrir" data-id="${esc(n.id)}">
        <div class="n-title">${esc(n.titulo)}</div>
        <div class="n-msg">${esc(n.mensaje)}</div>
        <div class="n-time">${fmtFecha(n.fecha)}</div>
      </div>
      <button class="modal-close boton-cerrar-chico"
        data-action="notificaciones:eliminar" data-id="${esc(n.id)}">&times;</button>
    </div>`
    )
    .join('');
}

export function alternarPanel(abrir) {
  const panel = $('notifPanel');
  if (!panel) return false;
  const visible = abrir === undefined ? panel.classList.toggle('show') : panel.classList.toggle('show', abrir);
  return visible;
}

export function panelVisible() {
  return $('notifPanel')?.classList.contains('show') || false;
}

/* ------------------------- configuración de avisos ------------------------ */

const RADIOS = {
  asignados: 'notifModoAsignados',
  municipios: 'notifModoMunicipios',
  todos: 'notifModoTodos',
  ninguno: 'notifModoNinguno'
};

/** Muestra u oculta el selector de municipios según el modo elegido. */
export function alternarMunicipiosConfig(modo = modoSeleccionado()) {
  const caja = $('notifMunicipiosBox');
  if (caja) caja.classList.toggle('u-oculto', modo !== 'municipios');
}

export function modoSeleccionado() {
  const marcado = document.querySelector('input[name="notifModo"]:checked');
  return marcado?.value || 'asignados';
}

/** Pinta el modal con las preferencias efectivas y el catálogo permitido. */
export function renderConfig({ preferencias = {}, municipios = [] } = {}) {
  const permitidos = Array.isArray(preferencias.permitidos)
    ? preferencias.permitidos
    : ['asignados', 'municipios', 'ninguno'];

  for (const [modo, id] of Object.entries(RADIOS)) {
    const radio = $(id);
    if (!radio) continue;
    radio.disabled = !permitidos.includes(modo);
    radio.checked = modo === (preferencias.modo || 'asignados');
    if (radio.disabled) radio.checked = false;
  }

  const selector = $('notifMunicipios');
  if (selector) {
    const elegidos = new Set((preferencias.municipios || []).map(String));
    selector.innerHTML = municipios
      .map(
        (m) =>
          `<option value="${esc(m.id)}"${elegidos.has(String(m.id)) ? ' selected' : ''}>${esc(m.nombre)}${m.estado ? ` — ${esc(m.estado)}` : ''}</option>`
      )
      .join('');
  }

  const correo = $('notifCorreo');
  if (correo) correo.checked = preferencias.porCorreo === true;

  renderEventosConfig(preferencias);

  const nota = $('notifConfigNota');
  if (nota) {
    nota.textContent =
      permitidos.includes('todos') && permitidos.includes('municipios')
        ? 'Como administrador puedes seguir cualquier municipio o todos.'
        : 'Solo puedes elegir municipios dentro de tu ámbito asignado.';
  }

  alternarMunicipiosConfig(preferencias.modo || 'asignados');
}

/** Lee lo que el usuario dejó marcado en el modal. */
export function leerConfig() {
  const selector = $('notifMunicipios');
  const eventos = {};
  document.querySelectorAll('#notifEventosLista select[data-evento]').forEach((select) => {
    if (select.value) eventos[select.dataset.evento] = select.value;
  });
  return {
    modo: modoSeleccionado(),
    municipios: selector
      ? [...selector.selectedOptions].map((opcion) => opcion.value).filter(Boolean)
      : [],
    porCorreo: $('notifCorreo')?.checked === true,
    eventos
  };
}

/** Filas de canal por tipo de aviso (heredar, app, correo, ambos, ninguno). */
function renderEventosConfig(preferencias = {}) {
  const contenedor = $('notifEventosLista');
  if (!contenedor) return;

  const catalogo = Array.isArray(preferencias.catalogo) ? preferencias.catalogo : [];
  const elegidos = preferencias.eventos || {};
  const canales = Array.isArray(preferencias.canales) ? preferencias.canales : [];
  const opciones = [
    ['', 'Heredar del sistema'],
    ...canales.map((c) => [c, etiquetaCanal(c)])
  ];

  contenedor.innerHTML = catalogo
    .map(
      (evento) => `
      <label class="notif-evento">
        <span title="${esc(evento.descripcion || '')}">${esc(evento.etiqueta || evento.evento)}</span>
        <select data-evento="${esc(evento.evento)}">
          ${opciones
            .map(
              ([valor, etiqueta]) =>
                `<option value="${esc(valor)}"${(elegidos[evento.evento] || '') === valor ? ' selected' : ''}>${esc(etiqueta)}</option>`
            )
            .join('')}
        </select>
      </label>`
    )
    .join('');
}

function etiquetaCanal(canal) {
  return (
    {
      app: 'En la campana',
      correo: 'Solo correo',
      ambos: 'Campana y correo',
      ninguno: 'Silenciar'
    }[canal] || canal
  );
}

/* --------------------------- historial de avisos ------------------------- */

export function renderHistorial({ notificaciones = [], total = 0, pagina = 1, limite = 30 } = {}) {
  const contenedor = $('historialNotifLista');
  if (!contenedor) return;
  if (!notificaciones.length) {
    contenedor.innerHTML =
      '<div class="notif-empty"><i class="bi bi-clock-history icono-vacio"></i>No hay avisos en el historial</div>';
  } else {
    contenedor.innerHTML = notificaciones
      .map(
        (n) => `
      <div class="notif-item ${n.leida ? '' : 'unread'}${claseSeveridad(n)}">
        <div class="n-icon">${iconoDe(n)}</div>
        <div class="n-content u-cursor" data-action="notificaciones:abrir" data-id="${esc(n.id)}">
          <div class="n-title">${esc(n.titulo)}</div>
          <div class="n-msg">${esc(n.mensaje)}</div>
          <div class="n-time">${fmtFecha(n.fecha)}${n.archivadaEn ? ' · archivada' : ''}</div>
        </div>
        <button class="btn btn-outline btn-sm" data-action="notificaciones:restaurar" data-id="${esc(n.id)}" title="Restaurar">
          <i class="bi bi-arrow-counterclockwise"></i>
        </button>
      </div>`
      )
      .join('');
  }
  const paginacion = $('historialNotifPaginacion');
  if (paginacion) {
    const paginas = Math.max(Math.ceil(total / limite), 1);
    paginacion.innerHTML = `
      <button class="btn btn-outline btn-sm" data-action="notificaciones:historialPagina" data-valor="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
      <span class="campo-nota">Página ${pagina} de ${paginas} · ${total} avisos</span>
      <button class="btn btn-outline btn-sm" data-action="notificaciones:historialPagina" data-valor="${pagina + 1}" ${pagina >= paginas ? 'disabled' : ''}>Siguiente →</button>`;
  }
}

export function leerFiltrosHistorial() {
  return {
    texto: $('historialNotifTexto')?.value?.trim() || '',
    evento: $('historialNotifEvento')?.value || '',
    desde: $('historialNotifDesde')?.value || '',
    hasta: $('historialNotifHasta')?.value || ''
  };
}
