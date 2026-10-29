/**
 * Utilidades de persistencia de la simulación.
 *
 * Los servicios de dominio no conocen el simulador: después de crear una fila
 * se marca con `simulado=1` y `simulacion_id`. La reversión usa ese sello para
 * borrar solo lo creado durante la sesión, sin tocar los datos reales.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export const TABLAS_SIMULADAS = [
  'usuarios',
  'incidencias',
  'incidencia_evidencias',
  'incidencia_comentarios',
  'recolecciones_firmas',
  'recoleccion_firmas',
  'tickets',
  'ticket_mensajes',
  'mensajes_directos',
  'contactos_funcionarios',
  'contacto_funcionario_mensajes',
  'solicitudes_funcionario',
  'mensajes_contacto',
  'sugerencias',
  'solicitudes_informe',
  'notificaciones',
  'publicaciones_redes',
  'correos_institucionales'
];

const COLECCIONES_JSON = new Set([
  ...TABLAS_SIMULADAS,
  'ticket_eventos',
  'recoleccion_firmas_envios',
  'contacto_funcionario_destinatarios',
  'usuario_municipios',
  'usuario_estados',
  'denuncias',
  'incidencia_historial'
]);

/** Marca una fila recién creada como parte de la simulación. */
export async function marcarSimulado(repositorio, tabla, id, simulacionId) {
  if (!id || !simulacionId) return false;
  if (repositorio.driver === 'mysql') {
    try {
      const actualizadas = await repositorio.knex(tabla)
        .where({ id })
        .update({ simulado: true, simulacion_id: simulacionId });
      return actualizadas > 0;
    } catch {
      return false;
    }
  }
  try {
    await repositorio.almacen.transaccion(tabla, [], (lista) => {
      const indice = lista.findIndex((fila) => fila.id === id);
      if (indice === -1) return { datos: lista, resultado: false };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], simulado: true, simulacionId };
      return { datos: copia, resultado: true };
    });
    return true;
  } catch {
    return false;
  }
}

/** Comentarios: en JSON viven dentro de la incidencia. */
export async function marcarComentarioSimulado(repositorio, incidenciaId, comentarioId, simulacionId) {
  if (!comentarioId || !simulacionId) return false;
  if (repositorio.driver === 'mysql') {
    return marcarSimulado(repositorio, 'incidencia_comentarios', comentarioId, simulacionId);
  }
  return repositorio.almacen.transaccion('incidencias', [], (lista) => {
    const indice = lista.findIndex((i) => i.id === incidenciaId);
    if (indice === -1) return { datos: lista, resultado: false };
    const comentarios = (lista[indice].comentarios || []).map((c) =>
      c.id === comentarioId ? { ...c, simulado: true, simulacionId } : c
    );
    const copia = lista.slice();
    copia[indice] = { ...copia[indice], comentarios };
    return { datos: copia, resultado: true };
  });
}

/** Marca las firmas de una recolección hechas por el usuario simulado. */
export async function marcarFirmasSimuladas(repositorio, recoleccionId, userKey, simulacionId) {
  if (repositorio.driver === 'mysql') {
    try {
      await repositorio.knex('recoleccion_firmas')
        .where({ recoleccion_id: recoleccionId, user_key: userKey })
        .update({ simulado: true, simulacion_id: simulacionId });
    } catch {
      /* la firma pudo no crearse */
    }
    return;
  }
  await repositorio.almacen.transaccion('recoleccion_firmas', [], (lista) => {
    const copia = lista.map((f) =>
      f.recoleccionId === recoleccionId && f.userKey === userKey
        ? { ...f, simulado: true, simulacionId }
        : f
    );
    return { datos: copia, resultado: true };
  });
}

async function borrarJson(repositorio, simulacionId) {
  const directorio = repositorio.directorio;
  const archivos = await fs.readdir(directorio);
  const incidencias = await repositorio.almacen.leer('incidencias', []);
  const tickets = await repositorio.almacen.leer('tickets', []);
  const contactos = await repositorio.almacen.leer('contactos_funcionarios', []);
  const recolecciones = await repositorio.almacen.leer('recolecciones_firmas', []);
  const usuarios = await repositorio.almacen.leer('usuarios', []);

  const idsIncidencias = new Set(
    incidencias.filter((i) => i.simulacionId === simulacionId).map((i) => i.id)
  );
  const idsTickets = new Set(tickets.filter((t) => t.simulacionId === simulacionId).map((t) => t.id));
  const idsContactos = new Set(
    contactos.filter((c) => c.simulacionId === simulacionId).map((c) => c.id)
  );
  const idsRecolecciones = new Set(
    recolecciones.filter((r) => r.simulacionId === simulacionId).map((r) => r.id)
  );
  const idsUsuarios = new Set(usuarios.filter((u) => u.simulacionId === simulacionId).map((u) => u.id));

  for (const archivo of archivos) {
    if (!archivo.endsWith('.json') || archivo.includes('.antes')) continue;
    const coleccion = archivo.replace(/\.json$/, '');
    if (coleccion === 'simulacion_sesiones' || coleccion === 'simulacion_operaciones') continue;
    const datos = await repositorio.almacen.leer(coleccion, []);
    if (!Array.isArray(datos)) continue;
    let cambio = false;
    const filtrados = datos
      .filter((fila) => {
        if (fila?.simulacionId === simulacionId) {
          cambio = true;
          return false;
        }
        if (coleccion === 'ticket_mensajes' || coleccion === 'ticket_eventos') {
          if (idsTickets.has(fila.ticketId)) {
            cambio = true;
            return false;
          }
        }
        if (
          coleccion === 'contacto_funcionario_destinatarios' ||
          coleccion === 'contacto_funcionario_mensajes'
        ) {
          if (idsContactos.has(fila.contactoId)) {
            cambio = true;
            return false;
          }
        }
        if (coleccion === 'recoleccion_firmas_envios' && idsRecolecciones.has(fila.recoleccionId)) {
          cambio = true;
          return false;
        }
        if (coleccion === 'usuario_municipios' || coleccion === 'usuario_estados') {
          if (idsUsuarios.has(fila.usuarioId)) {
            cambio = true;
            return false;
          }
        }
        if (coleccion === 'incidencia_historial' && idsIncidencias.has(fila.incidenciaId)) {
          cambio = true;
          return false;
        }
        if (coleccion === 'denuncias' && idsIncidencias.has(fila.incidenciaId)) {
          cambio = true;
          return false;
        }
        return true;
      })
      .map((fila) => {
        if (coleccion !== 'incidencias' || !Array.isArray(fila.comentarios)) return fila;
        const comentarios = fila.comentarios.filter((c) => c.simulacionId !== simulacionId);
        if (comentarios.length !== fila.comentarios.length) {
          cambio = true;
          return { ...fila, comentarios };
        }
        return fila;
      });
    if (cambio) await repositorio.almacen.escribir(coleccion, filtrados);
  }
  repositorio.catalogo?.clear?.();
}

async function borrarMysql(repositorio, simulacionId) {
  await repositorio.knex.transaction(async (trx) => {
    await trx.raw('SET FOREIGN_KEY_CHECKS = 0');
    try {
      const ids = async (tabla) =>
        trx(tabla).where({ simulacion_id: simulacionId }).pluck('id');
      const incidencias = await ids('incidencias');
      const tickets = await ids('tickets');
      const contactos = await ids('contactos_funcionarios');
      const recolecciones = await ids('recolecciones_firmas');
      const usuarios = await ids('usuarios');

      if (incidencias.length) {
        for (const tabla of [
          'incidencia_evidencias',
          'incidencia_historial',
          'incidencia_comentarios',
          'denuncias'
        ]) {
          if (await trx.schema.hasTable(tabla)) {
            await trx(tabla).whereIn('incidencia_id', incidencias).del();
          }
        }
      }
      if (tickets.length) {
        for (const tabla of ['ticket_mensajes', 'ticket_eventos']) {
          if (await trx.schema.hasTable(tabla)) {
            await trx(tabla).whereIn('ticket_id', tickets).del();
          }
        }
      }
      if (contactos.length) {
        for (const tabla of ['contacto_funcionario_destinatarios', 'contacto_funcionario_mensajes']) {
          if (await trx.schema.hasTable(tabla)) {
            await trx(tabla).whereIn('contacto_id', contactos).del();
          }
        }
      }
      if (recolecciones.length && (await trx.schema.hasTable('recoleccion_firmas_envios'))) {
        await trx('recoleccion_firmas_envios').whereIn('recoleccion_id', recolecciones).del();
      }
      if (usuarios.length) {
        for (const tabla of ['usuario_municipios', 'usuario_estados']) {
          if (await trx.schema.hasTable(tabla)) {
            await trx(tabla).whereIn('usuario_id', usuarios).del();
          }
        }
      }

      for (const tabla of TABLAS_SIMULADAS) {
        if (!(await trx.schema.hasTable(tabla))) continue;
        if (!(await trx.schema.hasColumn(tabla, 'simulacion_id'))) continue;
        await trx(tabla).where({ simulacion_id: simulacionId }).del();
      }
    } finally {
      await trx.raw('SET FOREIGN_KEY_CHECKS = 1');
    }
  });
}

/** Borra todo lo creado por una sesión, respetando dependencias. */
export async function eliminarDatosSimulacion(repositorio, simulacionId) {
  if (repositorio.driver === 'mysql') return borrarMysql(repositorio, simulacionId);
  return borrarJson(repositorio, simulacionId);
}

export function rutaUploadsSimulacion(config, simulacionId) {
  return path.join(config.paths.uploads || config.paths.data, 'simulacion', String(simulacionId));
}

/** Borra los archivos temporales de la sesión (si existen). */
export async function borrarUploadsSimulacion(config, simulacionId) {
  const ruta = rutaUploadsSimulacion(config, simulacionId);
  await fs.rm(ruta, { recursive: true, force: true }).catch(() => {});
}
