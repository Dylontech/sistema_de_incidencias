/**
 * Vista de soporte técnico (/soporte).
 *
 * Bandeja de tickets con filtros, asignación, prioridad, hilo y notas internas.
 * El servidor decide quién puede atender: esta página solo oculta lo que no
 * aplica y muestra los errores que devuelve la API.
 */
import { token } from './core/api.js';
import { esc, fmtFecha } from './core/utils.js';

const $ = (id) => document.getElementById(id);
const lista = $('soporteLista');
const detalle = $('soporteDetalle');
const aviso = $('soporteAviso');

const estado = {
  staff: [],
  tickets: [],
  actual: null,
  filtros: {}
};

function avisar(texto, tipo = 'info') {
  if (!aviso) return;
  aviso.className = `publico-msg ${tipo}`;
  aviso.textContent = texto;
}

async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  const respuesta = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.leer()}`
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(datos?.error || `Error ${respuesta.status}`);
  return datos;
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
  const clase = { alta: 'badge-rojo', media: 'badge-amarillo', baja: 'badge-gris' }[prioridad] || 'badge-gris';
  return `<span class="inc-badge ${clase}">${esc(prioridad)}</span>`;
}

function leerFiltros() {
  return {
    estado: $('soporteEstado')?.value || '',
    prioridad: $('soportePrioridad')?.value || '',
    asignacion: $('soporteAsignacion')?.value || '',
    texto: $('soporteBuscar')?.value.trim() || ''
  };
}

function consulta(filtros) {
  const params = new URLSearchParams();
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.prioridad) params.set('prioridad', filtros.prioridad);
  if (filtros.asignacion) params.set('asignacion', filtros.asignacion);
  if (filtros.texto) params.set('texto', filtros.texto);
  const cadena = params.toString();
  return cadena ? `?${cadena}` : '';
}

function renderLista() {
  if (!lista) return;
  if (!estado.tickets.length) {
    lista.innerHTML =
      '<p class="u-fs-12px u-suave">No hay tickets con esos filtros.</p>';
    return;
  }
  lista.innerHTML = estado.tickets
    .map(
      (t) => `
      <button type="button" class="soporte-item${estado.actual?.id === t.id ? ' activo' : ''}"
              data-ticket="${esc(t.id)}">
        <div class="u-fila-sep">
          <strong>${esc(t.folio)}</strong>
          ${badge(t.estado)}
        </div>
        <div class="soporte-item-asunto">${esc(t.asunto)}</div>
        <div class="soporte-item-meta">
          ${prioridadBadge(t.prioridad)}
          <span>${esc(t.categoria)}</span>
          <span>${t.asignadoA ? `👤 ${esc(t.asignadoA)}` : 'Sin asignar'}</span>
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
      `<option value="${esc(persona.username)}"${elegido}>${esc(persona.nombre)} (${esc(persona.rol)})</option>`
    );
  }
  return opciones.join('');
}

function renderDetalle(ticket) {
  if (!detalle) return;
  if (!ticket) {
    detalle.innerHTML =
      '<p class="u-fs-12px u-suave">Elige un ticket de la lista para atenderlo.</p>';
    return;
  }

  const mensajes = (ticket.mensajes || [])
    .map(
      (m) => `
      <div class="soporte-mensaje${m.interno ? ' interno' : ''}">
        <div class="u-fila-sep">
          <strong>${esc(m.autorUserKey || 'sistema')}</strong>
          <span class="u-fs-11px u-suave">${fmtFecha(m.creadoEn)}</span>
        </div>
        <p>${esc(m.cuerpo)}</p>
        ${m.interno ? '<span class="u-fs-11px">Nota interna</span>' : ''}
      </div>`
    )
    .join('');

  const eventos = (ticket.eventos || [])
    .slice(-12)
    .map(
      (e) =>
        `<li>${esc(e.tipo)}${e.de || e.a ? `: ${esc(e.de || '—')} → ${esc(e.a || '—')}` : ''} · ${esc(e.actor || 'sistema')} · ${fmtFecha(e.creadoEn)}</li>`
    )
    .join('');

  detalle.innerHTML = `
    <div class="soporte-detalle-head">
      <div>
        <h2>${esc(ticket.folio)} · ${esc(ticket.asunto)}</h2>
        <p class="u-fs-12px u-gris">
          Autor: ${esc(ticket.autorUserKey)} · ${fmtFecha(ticket.creadoEn)} · ${badge(ticket.estado)} ${prioridadBadge(ticket.prioridad)}
        </p>
      </div>
    </div>

    <div class="soporte-controles">
      <div class="form-group">
        <label for="soporteResponsable">Responsable</label>
        <select id="soporteResponsable">${opcionesResponsable(ticket.asignadoA)}</select>
      </div>
      <div class="form-group">
        <label for="soportePrioridadDetalle">Prioridad</label>
        <select id="soportePrioridadDetalle">
          ${['baja', 'media', 'alta']
            .map(
              (p) =>
                `<option value="${p}"${ticket.prioridad === p ? ' selected' : ''}>${p}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="soporteEstadoDetalle">Estado</label>
        <select id="soporteEstadoDetalle">
          ${['abierto', 'en_revision', 'respondido', 'cerrado']
            .map(
              (e) =>
                `<option value="${e}"${ticket.estado === e ? ' selected' : ''}>${e}</option>`
            )
            .join('')}
        </select>
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="soporteAplicar">
        <i class="bi bi-check2-circle"></i> Aplicar
      </button>
    </div>

    <div class="soporte-hilo">
      <h3>Conversación</h3>
      ${mensajes || '<p class="u-fs-12px u-suave">Sin mensajes todavía.</p>'}
    </div>

    <div class="soporte-responder">
      <label for="soporteRespuesta">Respuesta</label>
      <textarea id="soporteRespuesta" rows="4" maxlength="4000"
        placeholder="Escribe la respuesta al autor del ticket…"></textarea>
      <label class="check-line u-mt-6">
        <input type="checkbox" id="soporteInterno">
        <span>Nota interna (no la ve el ciudadano)</span>
      </label>
      <button type="button" class="btn btn-primary btn-sm u-mt-8" id="soporteEnviar">
        <i class="bi bi-send"></i> Enviar
      </button>
    </div>

    <details class="u-mt-12">
      <summary class="u-fs-12px">Historial del ticket</summary>
      <ul class="u-fs-11px u-gris">${eventos || '<li>Sin eventos.</li>'}</ul>
    </details>
  `;

  $('soporteEnviar')?.addEventListener('click', enviarRespuesta);
  $('soporteAplicar')?.addEventListener('click', aplicarCambios);
}

async function cargarStaff() {
  if (estado.staff.length) return;
  const { usuarios } = await api('/usuarios');
  estado.staff = usuarios.filter((u) => u.rol !== 'ciudadano');
}

async function cargar() {
  try {
    estado.filtros = leerFiltros();
    const { tickets } = await api(`/tickets${consulta(estado.filtros)}`);
    estado.tickets = tickets;
    renderLista();
    avisar(`${tickets.length} ticket(s) en la bandeja.`, 'info');
  } catch (error) {
    avisar(error.message, 'err');
  }
}

async function abrir(id) {
  try {
    const { ticket } = await api(`/tickets/${id}`);
    estado.actual = ticket;
    renderLista();
    renderDetalle(ticket);
  } catch (error) {
    avisar(error.message, 'err');
  }
}

async function enviarRespuesta() {
  const ticket = estado.actual;
  if (!ticket) return;
  const texto = $('soporteRespuesta')?.value.trim();
  const interno = $('soporteInterno')?.checked === true;
  if (!texto) {
    avisar('Escribe una respuesta', 'err');
    return;
  }
  try {
    const { ticket: actualizado } = await api(`/tickets/${ticket.id}/mensajes`, {
      metodo: 'POST',
      cuerpo: { texto, interno }
    });
    estado.actual = actualizado;
    renderDetalle(actualizado);
    await cargar();
    avisar(interno ? 'Nota interna guardada.' : 'Respuesta enviada.', 'ok');
  } catch (error) {
    avisar(error.message, 'err');
  }
}

async function aplicarCambios() {
  const ticket = estado.actual;
  if (!ticket) return;
  const responsable = $('soporteResponsable')?.value || '';
  const prioridad = $('soportePrioridadDetalle')?.value;
  const nuevoEstado = $('soporteEstadoDetalle')?.value;

  try {
    if (responsable !== (ticket.asignadoA || '')) {
      const { ticket: asignado } = await api(`/tickets/${ticket.id}/asignacion`, {
        metodo: 'PATCH',
        cuerpo: { asignadoA: responsable || null }
      });
      estado.actual = asignado;
    }
    if (prioridad && prioridad !== estado.actual.prioridad) {
      const { ticket: cambiado } = await api(`/tickets/${ticket.id}/prioridad`, {
        metodo: 'PATCH',
        cuerpo: { prioridad }
      });
      estado.actual = cambiado;
    }
    if (nuevoEstado && nuevoEstado !== estado.actual.estado) {
      const { ticket: cambiado } = await api(`/tickets/${ticket.id}/estado`, {
        metodo: 'PATCH',
        cuerpo: { estado: nuevoEstado }
      });
      estado.actual = cambiado;
    }
    renderDetalle(estado.actual);
    await cargar();
    avisar('Ticket actualizado.', 'ok');
  } catch (error) {
    avisar(error.message, 'err');
  }
}

$('soporteRecargar')?.addEventListener('click', cargar);
['soporteEstado', 'soportePrioridad', 'soporteAsignacion'].forEach((id) => {
  $(id)?.addEventListener('change', cargar);
});
$('soporteBuscar')?.addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter') cargar();
});
lista?.addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-ticket]');
  if (boton) abrir(boton.dataset.ticket);
});

function denegarAcceso(mensaje) {
  avisar(mensaje, 'err');
  $('soporteFiltros')?.setAttribute('hidden', '');
  $('soporteLayout')?.setAttribute('hidden', '');
  setTimeout(() => location.replace('/'), 4500);
}

function mostrarBandeja() {
  $('soporteFiltros')?.removeAttribute('hidden');
  $('soporteLayout')?.removeAttribute('hidden');
}

async function iniciar() {
  if (!token.leer()) {
    denegarAcceso('Necesitas iniciar sesión con una cuenta del personal para atender tickets.');
    return;
  }

  try {
    const { usuario } = await api('/auth/me');
    if (usuario?.puedeAtenderTickets !== true) {
      denegarAcceso('Tu cuenta no tiene el permiso para atender el panel de soporte.');
      return;
    }
  } catch (error) {
    denegarAcceso(error.message);
    return;
  }

  mostrarBandeja();
  try {
    await Promise.all([cargarStaff(), cargar()]);
    const id = new URLSearchParams(location.search).get('ticket');
    if (id) abrir(id);
  } catch (error) {
    avisar(error.message, 'err');
  }
}

iniciar();
