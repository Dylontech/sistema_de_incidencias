/**
 * Modal de tickets de soporte para la vista principal.
 *
 * Sustituye la página /tickets. Las sesiones anónimas ven el aviso de acceso;
 * las cuentas registradas pueden crear tickets, consultar los suyos y responder.
 */
import { registrarAcciones } from '../core/eventos.js';
import { $, esc } from '../core/utils.js';
import { sesion } from '../core/session.js';
import { abrirModal, cerrarModal, loading, toast } from '../core/ui.js';
import { intentar, mensajeDeError } from '../core/errores.js';
import { ticketsService } from '../services/tickets.service.js';

let tickets = [];
let ticketActivo = null;

function tieneCuenta() {
  return Boolean(sesion.usuario && sesion.usuario.rol !== 'anonimo');
}

function aviso(texto, tipo = 'info') {
  const caja = $('ticketsModalAviso');
  if (!caja) return;
  caja.className = `publico-msg ${tipo}`;
  caja.textContent = texto;
  caja.classList.remove('u-oculto');
}

function limpiarAviso() {
  const caja = $('ticketsModalAviso');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('u-oculto');
}

function aplicarAcceso() {
  const permitido = tieneCuenta();
  const bloqueo = $('ticketsModalBloqueo');
  if (bloqueo) {
    bloqueo.toggleAttribute('hidden', permitido);
    bloqueo.classList.toggle('u-oculto', permitido);
  }
  const formulario = $('formTicketModal');
  if (formulario) {
    formulario.toggleAttribute('hidden', !permitido);
    formulario.classList.toggle('u-oculto', !permitido);
  }
  $('ticketsModalContenido')?.classList.toggle('u-oculto', !permitido);
  $('ticketsModalLista')?.toggleAttribute('hidden', !permitido);
  $('ticketsModalDetalle')?.toggleAttribute('hidden', !permitido);
  return permitido;
}

function pintarLista() {
  const contenedor = $('ticketsModalLista');
  if (!contenedor) return;
  if (!tickets.length) {
    contenedor.innerHTML = '<p class="u-fs-12px u-suave">Todavía no has enviado tickets.</p>';
    return;
  }
  contenedor.innerHTML = tickets
    .map(
      (ticket) => `
      <div class="panel-blanco u-mb-8">
        <div class="u-fila-sep">
          <strong>${esc(ticket.folio)} · ${esc(ticket.asunto)}</strong>
          <span class="inc-badge badge-amarillo">${esc(ticket.estado)}</span>
        </div>
        <p class="u-fs-12px u-gris u-mt-4">${esc(ticket.cuerpo)}</p>
        <button type="button" class="btn btn-outline btn-sm u-mt-6"
          data-action="ticketsModal:ver" data-id="${esc(ticket.id)}">
          Ver conversación
        </button>
      </div>`
    )
    .join('');
}

async function cargar() {
  if (!tieneCuenta()) return;
  const { tickets: lista } = await ticketsService.listar();
  tickets = lista || [];
  pintarLista();
}

function pintarDetalle(ticket) {
  const contenedor = $('ticketsModalDetalle');
  if (!contenedor) return;
  const mensajes = (ticket.mensajes || [])
    .filter((m) => !m.interno)
    .map(
      (m) => `
      <div class="panel-blanco u-mb-6">
        <div class="u-fs-11px u-suave">${esc(m.autorUserKey || 'sistema')}</div>
        <div class="u-fs-12px u-mt-4">${esc(m.cuerpo)}</div>
      </div>`
    )
    .join('');
  contenedor.innerHTML = `
    <div class="panel-blanco">
      <div class="u-fila-sep">
        <h4 class="u-fs-14px">${esc(ticket.folio)} · ${esc(ticket.asunto)}</h4>
        <button type="button" class="btn btn-outline btn-sm" data-action="ticketsModal:cerrarDetalle">
          Cerrar detalle
        </button>
      </div>
      <p class="u-fs-11px u-suave">
        Estado: ${esc(ticket.estado)} · Prioridad: ${esc(ticket.prioridad)}
        ${ticket.asignadoA ? ` · Atiende: ${esc(ticket.asignadoA)}` : ''}
      </p>
      ${mensajes || '<p class="u-fs-12px u-suave">Sin respuestas todavía.</p>'}
      ${
        ticket.estado === 'cerrado'
          ? '<p class="u-fs-12px u-suave">El ticket está cerrado.</p>'
          : `<div class="u-mt-8">
              <label for="ticketsModalRespuesta" class="u-fs-12px">Responder</label>
              <textarea id="ticketsModalRespuesta" rows="3" maxlength="4000" class="u-mt-4"></textarea>
              <button type="button" class="btn btn-primary btn-sm u-mt-6"
                data-action="ticketsModal:responder" data-id="${esc(ticket.id)}">
                Enviar respuesta
              </button>
            </div>`
      }
    </div>`;
}

async function abrirTicket(id) {
  if (!tieneCuenta()) return;
  loading(true, 'Abriendo ticket…');
  try {
    const { ticket } = await ticketsService.obtener(id);
    ticketActivo = ticket;
    pintarDetalle(ticket);
  } catch (error) {
    aviso(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

async function abrir(id = null) {
  aplicarAcceso();
  abrirModal('modalTickets');
  if (!tieneCuenta()) return;
  limpiarAviso();
  if (!id) {
    ticketActivo = null;
    const detalle = $('ticketsModalDetalle');
    if (detalle) detalle.innerHTML = '';
  }
  await intentar(async () => {
    await cargar();
    if (id) await abrirTicket(id);
  });
}

async function enviar() {
  if (!tieneCuenta()) return;
  limpiarAviso();
  const asunto = $('ticketsModalAsunto')?.value.trim() || '';
  const cuerpo = $('ticketsModalCuerpo')?.value.trim() || '';
  if (!asunto || !cuerpo) return aviso('Escribe el asunto y la descripción.', 'err');
  loading(true, 'Enviando ticket…');
  try {
    await ticketsService.crear({
      asunto,
      cuerpo,
      categoria: $('ticketsModalCategoria')?.value || 'error',
      municipioId: sesion.municipioActivo?.id || null
    });
    $('formTicketModal')?.reset();
    aviso('Ticket enviado. El equipo de soporte lo revisará.', 'ok');
    toast('Ticket enviado', 'ok');
    await cargar();
  } catch (error) {
    aviso(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

async function responder(id) {
  const texto = $('ticketsModalRespuesta')?.value.trim() || '';
  if (!texto) return aviso('Escribe una respuesta.', 'err');
  loading(true, 'Enviando respuesta…');
  try {
    await ticketsService.responder(id, texto);
    aviso('Respuesta enviada.', 'ok');
    await Promise.all([cargar(), abrirTicket(id)]);
  } catch (error) {
    aviso(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

export function registrar() {
  registrarAcciones({
    'ticketsModal:abrir': () => intentar(() => abrir()),
    'ticketsModal:cerrar': () => cerrarModal('modalTickets'),
    'ticketsModal:actualizar': () => intentar(() => abrir(ticketActivo?.id || null)),
    'ticketsModal:enviar': () => intentar(enviar),
    'ticketsModal:ver': ({ id }) => intentar(() => abrirTicket(id)),
    'ticketsModal:responder': ({ id }) => intentar(() => responder(id)),
    'ticketsModal:cerrarDetalle': () => {
      ticketActivo = null;
      const detalle = $('ticketsModalDetalle');
      if (detalle) detalle.innerHTML = '';
    }
  });
}

export function abrirCon(id = null) {
  return abrir(id);
}
