/**
 * Bandeja de soporte dentro del modal de tickets.
 *
 * Se carga con `import()` solo cuando alguien con `atender_tickets` abre la
 * pestaña. Comparte el servicio HTTP y evita la página /soporte, que ahora es
 * una redirección.
 */
import { $, esc, fmtFecha } from '../core/utils.js';
import { loading, toast } from '../core/ui.js';
import { mensajeDeError } from '../core/errores.js';
import { ticketsService } from '../services/tickets.service.js';

const TTL_LISTA = 20_000;
const TTL_DETALLE = 15_000;
const TTL_STAFF = 300_000;

const estado = {
  staff: [],
  staffEn: 0,
  tickets: [],
  listaEn: 0,
  claveLista: '',
  actual: null,
  detalleEn: 0,
  filtros: {},
  montado: false
};

function avisar(texto, tipo = 'info') {
  const caja = $('ticketsAtencionAviso');
  if (!caja) return;
  caja.className = `publico-msg ${tipo}`;
  caja.textContent = texto;
  caja.classList.remove('u-oculto');
}

function limpiarAviso() {
  const caja = $('ticketsAtencionAviso');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('u-oculto');
}

function badge(estadoTicket) {
  const clase =
    {
      abierto: 'badge-amarillo',
      en_revision: 'badge-azul',
      respondido: 'badge-verde',
      cerrado: 'badge-gris'
    }[estadoTicket] || 'badge-gris';
  return `<span class="inc-badge ${clase}">${esc(estadoTicket)}</span>`;
}

function prioridadBadge(prioridad) {
  const clase =
    { alta: 'badge-rojo', media: 'badge-amarillo', baja: 'badge-gris' }[prioridad] ||
    'badge-gris';
  return `<span class="inc-badge ${clase}">${esc(prioridad)}</span>`;
}

function leerFiltros() {
  return {
    estado: $('ticketsAtencionEstado')?.value || '',
    prioridad: $('ticketsAtencionPrioridad')?.value || '',
    asignacion: $('ticketsAtencionAsignacion')?.value || '',
    texto: $('ticketsAtencionBuscar')?.value.trim() || ''
  };
}

function pintarLista() {
  const contenedor = $('ticketsAtencionLista');
  if (!contenedor) return;
  if (!estado.tickets.length) {
    contenedor.innerHTML =
      '<p class="u-fs-12px u-suave">No hay tickets con esos filtros.</p>';
    return;
  }
  contenedor.innerHTML = estado.tickets
    .map(
      (ticket) => `
      <button type="button" class="soporte-item${estado.actual?.id === ticket.id ? ' activo' : ''}"
              data-action="ticketsAtencion:ver" data-id="${esc(ticket.id)}">
        <div class="u-fila-sep">
          <strong>${esc(ticket.folio)}</strong>
          ${badge(ticket.estado)}
        </div>
        <div class="soporte-item-asunto">${esc(ticket.asunto)}</div>
        <div class="soporte-item-meta">
          ${prioridadBadge(ticket.prioridad)}
          <span>${esc(ticket.categoria)}</span>
          <span>${ticket.asignadoA ? `👤 ${esc(ticket.asignadoA)}` : 'Sin asignar'}</span>
        </div>
      </button>`
    )
    .join('');
}

function opcionesResponsable(actual) {
  const opciones = ['<option value="">— Sin asignar (cola) —</option>'];
  for (const persona of estado.staff) {
    const elegido = persona.username === actual ? ' selected' : '';
    opciones.push(
      `<option value="${esc(persona.username)}"${elegido}>${esc(persona.nombre)} (${esc(
        persona.rol
      )})</option>`
    );
  }
  return opciones.join('');
}

function opcionesEstado(ticket) {
  const transiciones = Array.isArray(ticket.transiciones)
    ? ticket.transiciones
    : ['abierto', 'en_revision', 'respondido', 'cerrado'];
  const valores = [ticket.estado, ...transiciones].filter(
    (valor, indice, lista) => valor && lista.indexOf(valor) === indice
  );
  return valores
    .map(
      (valor) =>
        `<option value="${esc(valor)}"${ticket.estado === valor ? ' selected' : ''}>${esc(
          valor
        )}</option>`
    )
    .join('');
}

function pintarDetalle(ticket) {
  const contenedor = $('ticketsAtencionDetalle');
  if (!contenedor) return;
  if (!ticket) {
    contenedor.innerHTML =
      '<p class="u-fs-12px u-suave">Elige un ticket de la lista para atenderlo.</p>';
    return;
  }

  const mensajes = (ticket.mensajes || [])
    .map(
      (mensaje) => `
      <div class="soporte-mensaje${mensaje.interno ? ' interno' : ''}">
        <div class="u-fila-sep">
          <strong>${esc(mensaje.autorUserKey || 'sistema')}</strong>
          <span class="u-fs-11px u-suave">${fmtFecha(mensaje.creadoEn)}</span>
        </div>
        <p>${esc(mensaje.cuerpo)}</p>
        ${mensaje.interno ? '<span class="u-fs-11px">Nota interna</span>' : ''}
      </div>`
    )
    .join('');

  const eventos = (ticket.eventos || [])
    .slice(-12)
    .map(
      (evento) =>
        `<li>${esc(evento.tipo)}${
          evento.de || evento.a
            ? `: ${esc(evento.de || '—')} → ${esc(evento.a || '—')}`
            : ''
        } · ${esc(evento.actor || 'sistema')} · ${fmtFecha(evento.creadoEn)}</li>`
    )
    .join('');

  contenedor.innerHTML = `
    <div class="soporte-detalle-head">
      <h4>${esc(ticket.folio)} · ${esc(ticket.asunto)}</h4>
      <p class="u-fs-12px u-gris">
        Autor: ${esc(ticket.autorUserKey)} · ${fmtFecha(ticket.creadoEn)}
        · ${badge(ticket.estado)} ${prioridadBadge(ticket.prioridad)}
      </p>
    </div>

    <div class="soporte-controles">
      <div class="form-group">
        <label for="ticketsAtencionResponsable">Responsable</label>
        <select id="ticketsAtencionResponsable">${opcionesResponsable(ticket.asignadoA)}</select>
      </div>
      <div class="form-group">
        <label for="ticketsAtencionPrioridadDetalle">Prioridad</label>
        <select id="ticketsAtencionPrioridadDetalle">
          ${['baja', 'media', 'alta']
            .map(
              (prioridad) =>
                `<option value="${prioridad}"${
                  ticket.prioridad === prioridad ? ' selected' : ''
                }>${prioridad}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="ticketsAtencionEstadoDetalle">Estado</label>
        <select id="ticketsAtencionEstadoDetalle">${opcionesEstado(ticket)}</select>
      </div>
      <button type="button" class="btn btn-primary btn-sm" data-action="ticketsAtencion:aplicar">
        <i class="bi bi-check2-circle"></i> Aplicar
      </button>
    </div>

    <div class="panel-blanco u-mb-10">
      <div class="u-fs-11px u-suave">Descripción original</div>
      <p class="u-fs-12px u-mt-4">${esc(ticket.cuerpo || 'Sin descripción registrada.')}</p>
    </div>

    <div class="soporte-hilo">
      <h3>Conversación</h3>
      ${mensajes || '<p class="u-fs-12px u-suave">Sin mensajes todavía.</p>'}
    </div>

    <div class="soporte-responder">
      <label for="ticketsAtencionRespuesta">Respuesta</label>
      <textarea id="ticketsAtencionRespuesta" rows="4" maxlength="4000"
        placeholder="Escribe la respuesta al autor del ticket…"></textarea>
      <label class="check-line u-mt-6">
        <input type="checkbox" id="ticketsAtencionInterno">
        <span>Nota interna (no la ve el ciudadano)</span>
      </label>
      <button type="button" class="btn btn-primary btn-sm u-mt-8" data-action="ticketsAtencion:responder">
        <i class="bi bi-send"></i> Enviar
      </button>
    </div>

    <details class="u-mt-12">
      <summary class="u-fs-12px">Historial del ticket</summary>
      <ul class="u-fs-11px u-gris">${eventos || '<li>Sin eventos.</li>'}</ul>
    </details>
  `;
}

async function cargarStaff(forzar = false) {
  if (!forzar && estado.staff.length && Date.now() - estado.staffEn < TTL_STAFF) return;
  const { personal } = await ticketsService.staff();
  estado.staff = personal || [];
  estado.staffEn = Date.now();
}

async function cargar(forzar = false) {
  const filtros = leerFiltros();
  const clave = JSON.stringify(filtros);
  estado.filtros = filtros;
  if (
    !forzar &&
    estado.tickets.length &&
    estado.claveLista === clave &&
    Date.now() - estado.listaEn < TTL_LISTA
  ) {
    pintarLista();
    return;
  }
  const { tickets } = await ticketsService.listar(filtros);
  estado.tickets = tickets || [];
  estado.claveLista = clave;
  estado.listaEn = Date.now();
  pintarLista();
  avisar(`${estado.tickets.length} ticket(s) en la bandeja.`, 'info');
}

async function ver(id, forzar = false) {
  if (
    !forzar &&
    estado.actual?.id === id &&
    Date.now() - estado.detalleEn < TTL_DETALLE
  ) {
    pintarDetalle(estado.actual);
    pintarLista();
    return;
  }
  const { ticket } = await ticketsService.obtener(id);
  estado.actual = ticket;
  estado.detalleEn = Date.now();
  pintarDetalle(ticket);
  pintarLista();
}

async function responder() {
  const ticket = estado.actual;
  if (!ticket) return;
  const texto = $('ticketsAtencionRespuesta')?.value.trim() || '';
  const interno = $('ticketsAtencionInterno')?.checked === true;
  if (!texto) return avisar('Escribe una respuesta.', 'err');
  loading(true, interno ? 'Guardando nota…' : 'Enviando respuesta…');
  try {
    const { ticket: actualizado } = await ticketsService.responder(ticket.id, texto, {
      interno
    });
    estado.actual = actualizado;
    estado.detalleEn = Date.now();
    estado.listaEn = 0;
    pintarDetalle(actualizado);
    await cargar(true).catch(() => null);
    avisar(interno ? 'Nota interna guardada.' : 'Respuesta enviada.', 'ok');
  } catch (error) {
    avisar(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

async function aplicar() {
  const ticket = estado.actual;
  if (!ticket) return;
  const responsable = $('ticketsAtencionResponsable')?.value || '';
  const prioridad = $('ticketsAtencionPrioridadDetalle')?.value;
  const nuevoEstado = $('ticketsAtencionEstadoDetalle')?.value;
  loading(true, 'Actualizando ticket…');
  try {
    let actual = ticket;
    if (responsable !== (ticket.asignadoA || '')) {
      const { ticket: asignado } = await ticketsService.asignar(
        ticket.id,
        responsable || null
      );
      actual = asignado;
    }
    if (prioridad && prioridad !== actual.prioridad) {
      const { ticket: cambiado } = await ticketsService.cambiarPrioridad(
        ticket.id,
        prioridad
      );
      actual = cambiado;
    }
    if (nuevoEstado && nuevoEstado !== actual.estado) {
      const { ticket: cambiado } = await ticketsService.cambiarEstado(
        ticket.id,
        nuevoEstado
      );
      actual = cambiado;
    }
    estado.actual = actual;
    estado.detalleEn = Date.now();
    estado.listaEn = 0;
    // La respuesta de las mutaciones no siempre trae los metadatos de acciones
    // y transiciones: se refresca el detalle una vez.
    await ver(ticket.id, true);
    await cargar(true).catch(() => null);
    toast('Ticket actualizado', 'ok');
  } catch (error) {
    avisar(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

export async function montar({ ticketId = null } = {}) {
  if (!estado.montado) {
    estado.montado = true;
    await cargarStaff().catch(() => {
      avisar('No se pudo cargar el personal de atención.', 'err');
    });
  }
  await cargar();
  if (ticketId) await ver(ticketId);
  else if (estado.actual) pintarDetalle(estado.actual);
}

export function actualizar() {
  return montar({ ticketId: estado.actual?.id || null });
}

export async function abrirTicket(id) {
  await ver(id);
}

export const verTicket = ver;
export const responderTicket = responder;
export const aplicarCambios = aplicar;

export function invalidar() {
  estado.listaEn = 0;
  estado.claveLista = '';
  estado.detalleEn = 0;
}
