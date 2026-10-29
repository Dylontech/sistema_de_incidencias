/**
 * SERVICIO: historial de folios.
 *
 * Reúne los folios de los trámites del usuario (incidencias, tickets,
 * informes, contacto, sugerencias, contacto directo y recolecciones de firmas).
 * El admin maestro puede buscar en todos.
 */
import { AppError } from '../utils/AppError.js';
import { esAdmin, esEmpleado } from './alcance.service.js';

function normalizar(valor) {
  return String(valor || '').trim().toUpperCase();
}

function dentroDeFechas(fecha, desde, hasta) {
  const ms = new Date(fecha).getTime();
  if (desde && ms < new Date(`${desde}T00:00:00`).getTime()) return false;
  if (hasta && ms > new Date(`${hasta}T23:59:59`).getTime()) return false;
  return true;
}

function fila({ folio, tipo, titulo, fecha, estado, url, referencia }) {
  return {
    folio: folio || '',
    tipo,
    titulo: titulo || '(sin título)',
    fecha,
    estado: estado || '',
    url: url || null,
    referencia: referencia || null
  };
}

async function recopilar(repositorio, usuario, { todos = false } = {}) {
  const userKey = usuario.userKey;
  const correo = usuario.correo || null;
  const [incidencias, tickets, informes, contacto, sugerencias, directos, recolecciones, mediaciones, accesos] =
    await Promise.all([
      repositorio.buscarIncidencias(todos ? { limite: 1000 } : { userKey, limite: 1000 }),
      repositorio.ticketsDe(todos ? { todos: true, limite: 500 } : { userKey, limite: 500 }),
      repositorio.solicitudesInforme({ correo: todos ? null : correo, limite: 500 }),
      repositorio.mensajesContacto({ limite: 500 }),
      repositorio.sugerencias({ limite: 500 }),
      repositorio.contactosFuncionarios({
        usuarioId: todos || !esEmpleado(usuario) ? null : usuario.id,
        limite: 500
      }),
      repositorio.recoleccionesFirmas({ limite: 500 }),
      repositorio.solicitudesFuncionario({ limite: 500 }),
      repositorio.solicitudesAcceso({ limite: 500 })
    ]);

  const filas = [];

  for (const incidencia of incidencias) {
    filas.push(
      fila({
        folio: incidencia.folio,
        tipo: 'incidencia',
        titulo: incidencia.titulo,
        fecha: incidencia.fecha,
        estado: incidencia.estado,
        url: `/?incidencia=${encodeURIComponent(incidencia.id)}`,
        referencia: incidencia.id
      })
    );
  }
  for (const ticket of tickets) {
    filas.push(
      fila({
        folio: ticket.folio,
        tipo: 'ticket',
        titulo: ticket.asunto,
        fecha: ticket.creadoEn,
        estado: ticket.estado,
        url: `/soporte?ticket=${encodeURIComponent(ticket.id)}`,
        referencia: ticket.id
      })
    );
  }
  for (const solicitud of informes) {
    if (!todos && (!correo || String(solicitud.correo).toLowerCase() !== String(correo).toLowerCase())) {
      continue;
    }
    filas.push(
      fila({
        folio: solicitud.folio,
        tipo: 'informe',
        titulo: `Solicitud de informe (${solicitud.formato || 'pdf'})`,
        fecha: solicitud.creadoEn,
        estado: solicitud.estado,
        url: `/?informe=1&folio=${encodeURIComponent(solicitud.folio)}`,
        referencia: solicitud.id
      })
    );
  }
  for (const mensaje of contacto) {
    if (!todos && (!correo || String(mensaje.correo).toLowerCase() !== String(correo).toLowerCase())) {
      continue;
    }
    filas.push(
      fila({
        folio: mensaje.folio,
        tipo: 'contacto',
        titulo: mensaje.asunto,
        fecha: mensaje.creadoEn,
        estado: mensaje.estado,
        url: `/?bandeja=contacto&id=${encodeURIComponent(mensaje.id)}`,
        referencia: mensaje.id
      })
    );
  }
  for (const sugerencia of sugerencias) {
    if (!todos && (!correo || String(sugerencia.correo || '').toLowerCase() !== String(correo).toLowerCase())) {
      continue;
    }
    filas.push(
      fila({
        folio: sugerencia.folio,
        tipo: 'sugerencia',
        titulo: sugerencia.mensaje?.slice(0, 80) || 'Sugerencia',
        fecha: sugerencia.creadoEn,
        estado: sugerencia.estado,
        url: `/?bandeja=sugerencias&id=${encodeURIComponent(sugerencia.id)}`,
        referencia: sugerencia.id
      })
    );
  }
  for (const directo of directos) {
    if (!todos && directo.deUserKey !== userKey && !esEmpleado(usuario)) continue;
    filas.push(
      fila({
        folio: directo.folio,
        tipo: 'contacto_funcionario',
        titulo: directo.asunto,
        fecha: directo.creadoEn,
        estado: directo.estado,
        url: `/?contacto=${encodeURIComponent(directo.id)}`,
        referencia: directo.id
      })
    );
  }
  for (const recoleccion of recolecciones) {
    if (!todos && recoleccion.creadoPorUserKey !== userKey) continue;
    filas.push(
      fila({
        folio: recoleccion.id?.slice(0, 8).toUpperCase() || 'RECOLECCION',
        tipo: 'firmas',
        titulo: recoleccion.titulo,
        fecha: recoleccion.creadoEn,
        estado: recoleccion.estado,
        url: recoleccion.incidenciaId
          ? `/?incidencia=${encodeURIComponent(recoleccion.incidenciaId)}&firmas=1`
          : '/?admin=firmas',
        referencia: recoleccion.id
      })
    );
  }
  for (const mediacion of mediaciones) {
    if (!todos && mediacion.solicitadoPorUserKey !== userKey) continue;
    filas.push(
      fila({
        folio: mediacion.folio,
        tipo: 'mediacion',
        titulo: 'Solicitud de funcionario para el municipio',
        fecha: mediacion.creadoEn,
        estado: mediacion.estado,
        url: '/?admin=mediaciones',
        referencia: mediacion.id
      })
    );
  }
  for (const acceso of accesos) {
    if (!todos && (!correo || String(acceso.correo || '').toLowerCase() !== String(correo).toLowerCase())) {
      continue;
    }
    filas.push(
      fila({
        folio: acceso.folio,
        tipo: 'acceso',
        titulo: 'Solicitud de acceso al sistema',
        fecha: acceso.creadoEn,
        estado: acceso.estado,
        url: '/solicitud-acceso',
        referencia: acceso.id
      })
    );
  }

  return filas;
}

function filtrar(filas, { texto = '', tipo = null, desde = null, hasta = null }) {
  const busqueda = normalizar(texto);
  return filas
    .filter((f) => !tipo || f.tipo === tipo)
    .filter(
      (f) =>
        !busqueda ||
        normalizar(f.folio).includes(busqueda) ||
        normalizar(f.titulo).includes(busqueda)
    )
    .filter((f) => dentroDeFechas(f.fecha, desde, hasta))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

function paginar(filas, { pagina = 1, limite = 20 } = {}) {
  const tamano = Math.min(Math.max(Number(limite) || 20, 1), 100);
  const actual = Math.max(Number(pagina) || 1, 1);
  return {
    folios: filas.slice((actual - 1) * tamano, actual * tamano),
    total: filas.length,
    pagina: actual,
    limite: tamano
  };
}

export async function mios(repositorio, usuario, filtros = {}) {
  if (!usuario || usuario.rol === 'anonimo') {
    return { folios: [], total: 0, pagina: 1, limite: 20, requiereCuenta: true };
  }
  const filas = filtrar(await recopilar(repositorio, usuario), filtros);
  return paginar(filas, filtros);
}

export async function todos(repositorio, usuario, filtros = {}) {
  if (!esAdmin(usuario)) throw AppError.prohibido('Solo el admin maestro puede ver todos los folios');
  const filas = filtrar(await recopilar(repositorio, usuario, { todos: true }), filtros);
  return paginar(filas, filtros);
}

export async function detalle(repositorio, usuario, folio) {
  const buscado = normalizar(folio);
  if (!buscado) throw AppError.solicitudInvalida('Escribe un folio');
  const filas = esAdmin(usuario)
    ? await recopilar(repositorio, usuario, { todos: true })
    : await recopilar(repositorio, usuario);
  const encontrado = filas.find((f) => normalizar(f.folio) === buscado);
  if (!encontrado) throw AppError.noEncontrado('No encontramos ese folio en tu historial');
  return encontrado;
}
