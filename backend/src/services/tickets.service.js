/**
 * SERVICIO: tickets de soporte.
 *
 * Cadena completa:
 *   crear → asignación automática (reglas) o cola → respuesta del equipo →
 *   respuesta del autor → cierre/reapertura, con historial y notificaciones.
 *
 * Permisos: el personal atiende con `atender_tickets`; `responder_tickets`
 * basta para responder, pero no para abrir la cola completa. El autor siempre
 * puede ver y responder lo suyo.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import {
  CATEGORIAS_TICKET,
  ESTADOS_TICKET,
  PRIORIDADES_TICKET,
  ROLES_ATENCION,
  ROLES_PERSONAL
} from '../config/constantes.js';
import { alcanceDe, esAdmin, esEmpleado } from './alcance.service.js';
import { permisosDe } from './permisos.service.js';
import { emitir } from './notificaciones.service.js';

const TRANSICIONES = {
  abierto: ['en_revision', 'respondido', 'cerrado'],
  en_revision: ['abierto', 'respondido', 'cerrado'],
  respondido: ['abierto', 'en_revision', 'cerrado'],
  cerrado: ['abierto']
};

function folio() {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const azar = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TCK-${fecha}-${azar}`;
}

function exigirCuenta(usuario) {
  if (!usuario || usuario.rol === 'anonimo') {
    throw AppError.prohibido('Abre una cuenta para enviar tickets de soporte');
  }
}

/** ¿Puede atender la cola de soporte? */
export function puedeAtender(usuario) {
  if (!usuario || !esEmpleado(usuario)) return false;
  if (esAdmin(usuario)) return true;
  return permisosDe(usuario).includes('atender_tickets');
}

function exigirAtencion(usuario) {
  if (!puedeAtender(usuario)) {
    throw AppError.prohibido('Tu cuenta no puede atender tickets de soporte');
  }
}

/** Alcance territorial aplicado a los tickets del equipo. */
async function dentroDelAlcance(repositorio, usuario, ticket) {
  if (esAdmin(usuario)) return true;
  // Un ticket sin municipio (cuenta sin ámbito) queda en la cola general.
  if (!ticket.municipioId) return true;
  const alcance = alcanceDe(usuario);
  if (alcance.todos) return true;
  if (alcance.municipios) return alcance.municipios.has(ticket.municipioId);
  if (!alcance.estados) return false;
  // El estado no viaja en el ticket: se resuelve con el catálogo. Sin esta
  // comprobación un administrador estatal podía abrir tickets de otro estado
  // conociendo el id.
  const municipio = await repositorio.municipioPorId(ticket.municipioId);
  return Boolean(municipio && alcance.estados.has(municipio.estado));
}

/** Personal activo que puede atender tickets, para el selector de responsables. */
export async function staffAtencion(repositorio, usuario) {
  exigirAtencion(usuario);
  const cuentas = await repositorio.todosLosUsuarios();
  return cuentas
    .filter((cuenta) => cuenta.activo !== false && puedeAtender(cuenta))
    .map((cuenta) => ({
      id: cuenta.id || null,
      username: cuenta.username,
      nombre: cuenta.nombre || cuenta.username,
      rol: cuenta.rol
    }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
}

/** Acciones que el cliente puede mostrar sin duplicar la máquina de estados. */
function conAcciones(ticket, usuario) {
  const atiende = puedeAtender(usuario);
  const esAutor = ticket.autorUserKey === usuario.userKey;
  return {
    ...ticket,
    transiciones: atiende ? TRANSICIONES[ticket.estado] || [] : [],
    acciones: {
      responder: (esAutor || atiende) && ticket.estado !== 'cerrado',
      asignar: atiende,
      prioridad: atiende,
      cerrar: atiende && ticket.estado !== 'cerrado',
      reabrir: atiende && ticket.estado === 'cerrado'
    }
  };
}

function texto(valor, campo, { requerido = false, max = 4000 } = {}) {
  const limpio = String(valor ?? '').trim();
  if (requerido && !limpio) {
    throw AppError.solicitudInvalida(`Escribe ${campo}`);
  }
  if (limpio.length > max) {
    throw AppError.solicitudInvalida(`Máximo ${max} caracteres en ${campo}`);
  }
  return limpio;
}

async function registrarEvento(
  repositorio,
  ticketId,
  { tipo, de = null, a = null, actor = null, nota = '' }
) {
  const evento = {
    id: nuevoId(),
    ticketId,
    tipo,
    de,
    a,
    actor,
    nota: String(nota || '').slice(0, 500),
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearTicketEvento(evento);
  return evento;
}

/**
 * Elige responsable: primero reglas específicas (municipio+prioridad,
 * municipio, prioridad) y, si la regla es por rol, la persona con menos
 * tickets abiertos de ese rol.
 */
async function resolverAsignacion(repositorio, ticket) {
  const reglas = (await repositorio.reglasTickets()).filter((r) => r.activo !== false);
  const puntuar = (regla) => {
    let puntos = 0;
    if (regla.municipioId && regla.municipioId === ticket.municipioId) puntos += 4;
    else if (regla.municipioId) return -1;
    if (regla.prioridad && regla.prioridad === ticket.prioridad) puntos += 2;
    else if (regla.prioridad) return -1;
    if (regla.estado) return -1; // el estado del ticket aún no se conoce al crear
    return puntos;
  };
  const ordenadas = reglas
    .map((regla) => ({ regla, puntos: puntuar(regla) }))
    .filter((r) => r.puntos >= 0)
    .sort((a, b) => b.puntos - a.puntos);

  for (const { regla } of ordenadas) {
    if (regla.asignarA) {
      const cuenta = await repositorio.usuarioPorUsername(regla.asignarA);
      if (cuenta && esEmpleado(cuenta) && cuenta.activo !== false) return cuenta.username;
      continue;
    }
    if (regla.asignarRol) {
      const candidatos = (await repositorio.usuariosPorRoles([regla.asignarRol])).filter(
        (cuenta) => cuenta.activo !== false && puedeAtender(cuenta)
      );
      if (candidatos.length) {
        const abiertos = await repositorio.ticketsDe({ todos: true, limite: 500 });
        const carga = new Map(candidatos.map((c) => [c.username, 0]));
        abiertos
          .filter((t) => t.estado !== 'cerrado' && carga.has(t.asignadoA))
          .forEach((t) => carga.set(t.asignadoA, carga.get(t.asignadoA) + 1));
        return [...carga.entries()].sort((a, b) => a[1] - b[1])[0][0];
      }
    }
  }
  return null;
}

export async function crear(repositorio, usuario, datos = {}) {
  exigirCuenta(usuario);
  const asunto = texto(datos.asunto, 'un asunto más descriptivo', { requerido: true, max: 200 });
  const cuerpo = texto(datos.cuerpo, 'el problema con más detalle', { requerido: true, max: 4000 });
  if (asunto.length < 5) throw AppError.solicitudInvalida('Escribe un asunto más descriptivo');
  if (cuerpo.length < 10) throw AppError.solicitudInvalida('Describe el problema con más detalle');

  // Municipio del ticket: el que envíe el formulario (municipio activo) o el
  // de la cuenta. Es lo que permite asignar por territorio.
  let municipioId = usuario.municipioId || null;
  if (datos.municipioId) {
    const municipio = await repositorio.municipioPorId(String(datos.municipioId));
    if (!municipio) throw AppError.solicitudInvalida('Municipio no encontrado');
    municipioId = municipio.id;
  }

  // La prioridad es una decisión del equipo que atiende tickets. Un ciudadano
  // puede enviarla en el cuerpo por compatibilidad, pero el servidor la ignora
  // y el ticket nace en «media»; soporte/admin sí pueden fijarla al crearlo.
  const puedeDefinirPrioridad = puedeAtender(usuario);
  let prioridad = 'media';
  if (puedeDefinirPrioridad && datos.prioridad !== undefined) {
    if (!PRIORIDADES_TICKET.includes(datos.prioridad)) {
      throw AppError.solicitudInvalida('Prioridad no válida');
    }
    prioridad = datos.prioridad;
  }

  const ticket = {
    id: nuevoId(),
    folio: folio(),
    autorUserKey: usuario.userKey,
    autorRol: usuario.rol,
    municipioId,
    asunto,
    categoria: CATEGORIAS_TICKET.includes(datos.categoria) ? datos.categoria : 'error',
    prioridad,
    estado: 'abierto',
    asignadoA: null,
    asignadoEn: null,
    asignadoPor: null,
    grupo: null,
    reabiertoEn: null,
    cuerpo,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString(),
    cerradoEn: null
  };

  // Asignación automática (si hay reglas); si no, queda en la cola.
  const responsable = await resolverAsignacion(repositorio, ticket);
  if (responsable) {
    ticket.asignadoA = responsable;
    ticket.asignadoEn = new Date().toISOString();
    ticket.asignadoPor = 'automático';
  }

  await repositorio.crearTicket(ticket);
  await registrarEvento(repositorio, ticket.id, {
    tipo: 'creado',
    a: ticket.asignadoA,
    actor: usuario.username,
    nota: asunto
  });
  if (ticket.asignadoA) {
    await registrarEvento(repositorio, ticket.id, {
      tipo: 'asignado',
      a: ticket.asignadoA,
      actor: 'automático'
    });
  }

  // Aviso al equipo (según configuración global) y al responsable.
  await emitir(repositorio, {
    evento: 'ticket_creado',
    titulo: `🎫 Nuevo ticket ${ticket.folio}`,
    mensaje: `${ticket.asunto} (${ticket.prioridad})`,
    severidad: ticket.prioridad === 'alta' ? 'alerta' : 'info',
    entidadTipo: 'ticket',
    entidadId: ticket.id,
    municipioId: ticket.municipioId,
    url: `/?ticket=${ticket.id}`,
    excluir: [usuario.username],
    claveDedupe: `ticket_creado:${ticket.id}`
  }).catch(() => {});

  if (ticket.asignadoA) {
    await emitir(repositorio, {
      evento: 'ticket_asignado',
      titulo: `🎫 Ticket asignado ${ticket.folio}`,
      mensaje: ticket.asunto,
      severidad: 'info',
      entidadTipo: 'ticket',
      entidadId: ticket.id,
      municipioId: ticket.municipioId,
      url: `/?ticket=${ticket.id}`,
      paraUsuarios: [ticket.asignadoA],
      claveDedupe: `ticket_asignado:${ticket.id}:${ticket.asignadoA}`
    }).catch(() => {});
  }

  return ticket;
}

export async function listar(repositorio, usuario, filtros = {}) {
  exigirCuenta(usuario);
  const atiende = puedeAtender(usuario);
  const solicitud = {
    userKey: usuario.userKey,
    todos: atiende,
    estado: filtros.estado || null,
    prioridad: filtros.prioridad || null,
    categoria: filtros.categoria || null,
    municipioId: filtros.municipioId || null,
    texto: filtros.texto || null,
    limite: filtros.limite || 200
  };

  if (filtros.asignacion === 'sin') solicitud.asignadoA = null;
  else if (filtros.asignacion === 'mios') solicitud.asignadoA = usuario.username;
  else if (filtros.asignadoA) solicitud.asignadoA = filtros.asignadoA;

  const tickets = await repositorio.ticketsDe(solicitud);
  if (!atiende) return tickets;

  // El equipo solo ve lo de su ámbito; el catálogo resuelve el alcance estatal.
  if (esAdmin(usuario)) return tickets;
  const alcance = alcanceDe(usuario);
  if (alcance.todos) return tickets;
  if (alcance.municipios?.size) {
    return tickets.filter(
      (t) => !t.municipioId || alcance.municipios.has(t.municipioId)
    );
  }
  if (alcance.estados?.size) {
    const catalogo = await repositorio.todosMunicipios();
    const porEstado = new Map(catalogo.map((m) => [m.id, m.estado]));
    return tickets.filter((t) => {
      if (!t.municipioId) return true;
      return alcance.estados.has(porEstado.get(t.municipioId));
    });
  }
  // Administrador territorial sin asignaciones: no ve la cola.
  return [];
}

export async function obtener(repositorio, usuario, id) {
  exigirCuenta(usuario);
  const ticket = await repositorio.ticketPorId(id);
  if (!ticket) throw AppError.noEncontrado('Ticket no encontrado');

  const esAutor = ticket.autorUserKey === usuario.userKey;
  if (!esAutor) {
    exigirAtencion(usuario);
    if (!(await dentroDelAlcance(repositorio, usuario, ticket))) {
      throw AppError.prohibido('Ese ticket pertenece a otro ámbito');
    }
  }

  // Un ciudadano no ve las notas internas del equipo.
  if (!puedeAtender(usuario)) {
    return conAcciones(
      {
        ...ticket,
        mensajes: ticket.mensajes.filter((m) => !m.interno),
        eventos: []
      },
      usuario
    );
  }
  return conAcciones(ticket, usuario);
}

export async function responder(repositorio, usuario, id, contenido, { interno = false } = {}) {
  const ticket = await obtener(repositorio, usuario, id);
  const esAutor = ticket.autorUserKey === usuario.userKey;
  const atiende = puedeAtender(usuario);
  if (!esAutor && !atiende) throw AppError.prohibido('No puedes responder este ticket');
  if (!esAutor && !permisosDe(usuario).includes('responder_tickets') && !atiende) {
    throw AppError.prohibido('Tu cuenta no tiene permiso para responder tickets');
  }
  if (interno && !atiende) throw AppError.prohibido('Solo el equipo puede dejar notas internas');
  if (ticket.estado === 'cerrado') {
    throw AppError.conflicto('El ticket está cerrado; reábrelo para responder');
  }

  const cuerpo = texto(contenido, 'una respuesta', { requerido: true, max: 4000 });
  const mensaje = {
    id: nuevoId(),
    ticketId: id,
    autorUserKey: usuario.userKey,
    autorRol: usuario.rol,
    cuerpo,
    interno: interno === true,
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearTicketMensaje(mensaje);
  await registrarEvento(repositorio, id, {
    tipo: interno ? 'nota_interna' : 'respondido',
    actor: usuario.username,
    nota: cuerpo.slice(0, 200)
  });

  const cambios = { estado: atiende && !esAutor ? 'respondido' : 'abierto' };
  await repositorio.actualizarTicket(id, cambios);

  // Avisos: al autor cuando responde el equipo (salvo nota interna) y al
  // responsable cuando responde el autor.
  if (!interno) {
    if (!esAutor) {
      await emitir(repositorio, {
        evento: 'ticket_respondido',
        titulo: `💬 Respuesta a tu ticket ${ticket.folio}`,
        mensaje: cuerpo.slice(0, 160),
        severidad: 'info',
        entidadTipo: 'ticket',
        entidadId: id,
        municipioId: ticket.municipioId,
        url: `/?ticket=${id}`,
        paraUsuarios: [ticket.autorUserKey],
        claveDedupe: `ticket_respondido:${mensaje.id}`
      }).catch(() => {});
    } else if (ticket.asignadoA) {
      await emitir(repositorio, {
        evento: 'ticket_respondido',
        titulo: `💬 ${ticket.folio} tiene una respuesta del autor`,
        mensaje: cuerpo.slice(0, 160),
        severidad: 'info',
        entidadTipo: 'ticket',
        entidadId: id,
        municipioId: ticket.municipioId,
        url: `/?ticket=${id}`,
        paraUsuarios: [ticket.asignadoA],
        claveDedupe: `ticket_respondido_autor:${mensaje.id}`
      }).catch(() => {});
    }
  }

  return obtener(repositorio, usuario, id);
}

export async function cambiarEstado(repositorio, usuario, id, estado) {
  exigirAtencion(usuario);
  if (!ESTADOS_TICKET.includes(estado)) throw AppError.solicitudInvalida('Estado no válido');
  const ticket = await obtener(repositorio, usuario, id);

  const permitidos = TRANSICIONES[ticket.estado] || [];
  if (!permitidos.includes(estado)) {
    throw AppError.conflicto(`No se puede pasar de «${ticket.estado}» a «${estado}»`);
  }

  const reabre = estado === 'abierto' && ticket.estado === 'cerrado';
  const cambios = {
    estado,
    cerradoEn: estado === 'cerrado' ? new Date().toISOString() : null,
    reabiertoEn: reabre ? new Date().toISOString() : ticket.reabiertoEn
  };
  const actualizado = await repositorio.actualizarTicket(id, cambios);
  await registrarEvento(repositorio, id, {
    tipo: reabre ? 'reabierto' : 'estado',
    de: ticket.estado,
    a: estado,
    actor: usuario.username
  });

  if (estado === 'cerrado') {
    await emitir(repositorio, {
      evento: 'ticket_cerrado',
      titulo: `✅ Ticket ${ticket.folio} cerrado`,
      mensaje: `Tu ticket "${ticket.asunto}" se cerró.`,
      severidad: 'exito',
      entidadTipo: 'ticket',
      entidadId: id,
      municipioId: ticket.municipioId,
      url: `/?ticket=${id}`,
      paraUsuarios: [ticket.autorUserKey],
      claveDedupe: `ticket_cerrado:${id}:${cambios.cerradoEn}`
    }).catch(() => {});
  } else if (reabre && ticket.asignadoA) {
    await emitir(repositorio, {
      evento: 'ticket_reabierto',
      titulo: `🔓 Ticket ${ticket.folio} reabierto`,
      mensaje: ticket.asunto,
      severidad: 'alerta',
      entidadTipo: 'ticket',
      entidadId: id,
      municipioId: ticket.municipioId,
      url: `/?ticket=${id}`,
      paraUsuarios: [ticket.asignadoA],
      claveDedupe: `ticket_reabierto:${id}:${cambios.reabiertoEn}`
    }).catch(() => {});
  }

  return actualizado;
}

export async function asignar(repositorio, actor, id, { asignadoA = null, nota = '' } = {}) {
  exigirAtencion(actor);
  const ticket = await obtener(repositorio, actor, id);

  let responsable = null;
  if (asignadoA) {
    responsable = await repositorio.usuarioPorUsername(asignadoA);
    if (!responsable || !esEmpleado(responsable) || responsable.activo === false) {
      throw AppError.solicitudInvalida('El responsable debe ser una cuenta del personal activa');
    }
    if (!puedeAtender(responsable)) {
      throw AppError.solicitudInvalida('Esa cuenta no tiene permiso para atender tickets');
    }
  }

  const actualizado = await repositorio.actualizarTicket(id, {
    asignadoA: responsable?.username || null,
    asignadoEn: responsable ? new Date().toISOString() : null,
    asignadoPor: responsable ? actor.username : null,
    grupo: responsable ? null : 'soporte'
  });
  await registrarEvento(repositorio, id, {
    tipo: ticket.asignadoA ? 'reasignado' : 'asignado',
    de: ticket.asignadoA,
    a: responsable?.username || null,
    actor: actor.username,
    nota
  });

  if (responsable) {
    await emitir(repositorio, {
      evento: 'ticket_asignado',
      titulo: `🎫 Ticket ${ticket.folio} asignado`,
      mensaje: `${ticket.asunto}${nota ? ` · ${nota}` : ''}`,
      severidad: ticket.prioridad === 'alta' ? 'alerta' : 'info',
      entidadTipo: 'ticket',
      entidadId: id,
      municipioId: ticket.municipioId,
      url: `/?ticket=${id}`,
      paraUsuarios: [responsable.username],
      claveDedupe: `ticket_asignado:${id}:${responsable.username}:${Date.now()}`
    }).catch(() => {});
  }

  return actualizado;
}

export async function cambiarPrioridad(repositorio, actor, id, prioridad) {
  exigirAtencion(actor);
  if (!PRIORIDADES_TICKET.includes(prioridad)) {
    throw AppError.solicitudInvalida('Prioridad no válida');
  }
  const ticket = await obtener(repositorio, actor, id);
  const actualizado = await repositorio.actualizarTicket(id, { prioridad });
  await registrarEvento(repositorio, id, {
    tipo: 'prioridad',
    de: ticket.prioridad,
    a: prioridad,
    actor: actor.username
  });
  return actualizado;
}

/* ------------------------------ reglas ------------------------------ */

export async function listarReglas(repositorio, usuario) {
  if (!esAdmin(usuario)) throw AppError.prohibido('Solo un administrador gestiona las reglas');
  return repositorio.reglasTickets();
}

export async function crearRegla(repositorio, usuario, datos = {}) {
  if (!esAdmin(usuario)) throw AppError.prohibido('Solo un administrador gestiona las reglas');
  const municipioId = datos.municipioId ? String(datos.municipioId) : null;
  const estado = datos.estado ? String(datos.estado).slice(0, 120) : null;
  const prioridad = PRIORIDADES_TICKET.includes(datos.prioridad) ? datos.prioridad : null;
  const asignarA = datos.asignarA ? String(datos.asignarA) : null;
  const asignarRol = ROLES_ATENCION.includes(datos.asignarRol) ? datos.asignarRol : null;

  if (!asignarA && !asignarRol) {
    throw AppError.solicitudInvalida('Elige una persona o un rol que pueda atender tickets');
  }
  if (asignarA) {
    const cuenta = await repositorio.usuarioPorUsername(asignarA);
    if (!cuenta || !esEmpleado(cuenta)) {
      throw AppError.solicitudInvalida('La persona asignada no es del personal');
    }
  }
  if (!municipioId && !estado && !prioridad) {
    throw AppError.solicitudInvalida('Indica municipio, estado o prioridad para la regla');
  }

  return repositorio.crearReglaTicket({
    id: nuevoId(),
    municipioId,
    estado,
    prioridad,
    asignarA,
    asignarRol,
    activo: datos.activo !== false,
    creadoEn: new Date().toISOString()
  });
}

export async function eliminarRegla(repositorio, usuario, id) {
  if (!esAdmin(usuario)) throw AppError.prohibido('Solo un administrador gestiona las reglas');
  const eliminada = await repositorio.eliminarReglaTicket(id);
  if (!eliminada) throw AppError.noEncontrado('Regla no encontrada');
  return { eliminada: true, id };
}

export { CATEGORIAS_TICKET, ESTADOS_TICKET, PRIORIDADES_TICKET };

