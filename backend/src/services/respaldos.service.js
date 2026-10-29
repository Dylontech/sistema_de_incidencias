/**
 * SERVICIO: respaldos y restauración.
 *
 * Genera un snapshot JSON comprimido de todas las tablas/colecciones (salvo
 * los propios respaldos), con hash y metadatos. La restauración exige un
 * respaldo previo y se ejecuta en una transacción con las FKs desactivadas.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createGunzip, gzipSync, gunzipSync } from 'node:zlib';
import { config } from '../config/index.js';
import { nuevoId } from '../utils/ids.js';
import { AppError } from '../utils/AppError.js';
import { valor as valorConfig } from './configuracion.service.js';
import { emitir } from './notificaciones.service.js';

const CARPETA = () => path.join(config.paths.data, 'respaldos');
const EXCLUIR = new Set(['respaldos', 'respaldos_eventos', 'knex_migrations', 'knex_migrations_lock']);

function marca() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function tablasMysql(repositorio) {
  const filas = await repositorio.knex('information_schema.TABLES')
    .select('TABLE_NAME as tabla')
    .where({ TABLE_SCHEMA: config.db.connection.database, TABLE_TYPE: 'BASE TABLE' })
    .orderBy('TABLE_NAME');
  return filas.map((f) => f.tabla).filter((t) => !EXCLUIR.has(t));
}

async function coleccionesJson(repositorio) {
  await fs.mkdir(config.paths.data, { recursive: true });
  const archivos = await fs.readdir(config.paths.data);
  return archivos
    .filter((a) => a.endsWith('.json') && !a.includes('.antes') && a !== 'respaldos.json')
    .map((a) => a.replace(/\.json$/, ''))
    .filter((c) => !EXCLUIR.has(c));
}

async function snapshot(repositorio, incluirSimulados) {
  const datos = {
    version: 1,
    generadoEn: new Date().toISOString(),
    driver: repositorio.driver,
    tablas: {}
  };
  if (repositorio.driver === 'mysql') {
    const tablas = await tablasMysql(repositorio);
    for (const tabla of tablas) {
      let filas = await repositorio.knex(tabla).select('*');
      if (!incluirSimulados && filas.some((f) => 'simulado' in f)) {
        filas = filas.filter((f) => !f.simulado);
      }
      datos.tablas[tabla] = filas;
    }
  } else {
    const colecciones = await coleccionesJson(repositorio);
    for (const coleccion of colecciones) {
      let filas = await repositorio.almacen.leer(coleccion, []);
      if (!incluirSimulados && Array.isArray(filas)) {
        filas = filas.filter((f) => !f?.simulado);
      }
      datos.tablas[coleccion] = filas;
    }
  }
  return datos;
}

/** Crea un respaldo y registra sus metadatos. */
export async function crear(repositorio, actor, datos = {}) {
  const tipo = ['manual', 'automatico', 'previo_restauracion'].includes(datos.tipo)
    ? datos.tipo
    : 'manual';
  const incluirSimulados = datos.incluirSimulados === true;
  const id = nuevoId();
  const nombre = String(datos.nombre || `Respaldo ${tipo} ${new Date().toLocaleString('es-MX')}`).slice(0, 160);
  const archivo = `respaldo-${marca()}-${id.slice(0, 8)}.json.gz`;
  const ruta = path.join(CARPETA(), archivo);

  await repositorio.crearRespaldo({
    id,
    nombre,
    tipo,
    formato: 'json',
    archivo,
    tamano: 0,
    hash: null,
    estado: 'generando',
    incluyeSimulados: incluirSimulados,
    creadoPor: actor?.username || null,
    creadoEn: new Date().toISOString(),
    restauradoEn: null,
    notas: String(datos.notas || '').slice(0, 1000)
  });

  try {
    const contenido = await snapshot(repositorio, incluirSimulados);
    const json = Buffer.from(JSON.stringify(contenido), 'utf8');
    const comprimido = gzipSync(json, { level: 6 });
    await fs.mkdir(CARPETA(), { recursive: true });
    await fs.writeFile(ruta, comprimido);
    const actualizado = await repositorio.actualizarRespaldo(id, {
      tamano: comprimido.length,
      hash: hash(json),
      estado: 'listo'
    });
    await repositorio.crearEventoRespaldo({
      id: nuevoId(),
      respaldoId: id,
      tipo: 'creado',
      actor: actor?.username || null,
      detalle: `${Object.keys(contenido.tablas).length} tablas · ${json.length} bytes sin comprimir`,
      creadoEn: new Date().toISOString()
    });
    return actualizado;
  } catch (error) {
    await repositorio.actualizarRespaldo(id, { estado: 'error', error: error.message });
    await repositorio.crearEventoRespaldo({
      id: nuevoId(),
      respaldoId: id,
      tipo: 'error',
      actor: actor?.username || null,
      detalle: error.message,
      creadoEn: new Date().toISOString()
    });
    throw error;
  }
}

export async function listar(repositorio, filtros = {}) {
  return repositorio.respaldos(filtros);
}

export async function detalle(repositorio, id) {
  const respaldo = await repositorio.respaldoPorId(id);
  if (!respaldo) throw AppError.noEncontrado('Respaldo no encontrado');
  return { ...respaldo, eventos: await repositorio.eventosRespaldo(id) };
}

export async function rutaDescarga(repositorio, actor, id) {
  const respaldo = await repositorio.respaldoPorId(id);
  if (!respaldo) throw AppError.noEncontrado('Respaldo no encontrado');
  const ruta = path.join(CARPETA(), respaldo.archivo);
  await fs.access(ruta).catch(() => {
    throw AppError.noEncontrado('El archivo del respaldo ya no está en el servidor');
  });
  await repositorio.crearEventoRespaldo({
    id: nuevoId(),
    respaldoId: id,
    tipo: 'descargado',
    actor: actor?.username || null,
    detalle: respaldo.archivo,
    creadoEn: new Date().toISOString()
  });
  return { respaldo, ruta };
}

export async function eliminar(repositorio, actor, id) {
  const respaldo = await repositorio.respaldoPorId(id);
  if (!respaldo) throw AppError.noEncontrado('Respaldo no encontrado');
  await repositorio.actualizarRespaldo(id, { estado: 'error', error: 'Eliminado por el administrador' });
  await repositorio.crearEventoRespaldo({
    id: nuevoId(),
    respaldoId: id,
    tipo: 'eliminado',
    actor: actor?.username || null,
    detalle: respaldo.archivo,
    creadoEn: new Date().toISOString()
  });
  return { eliminado: true, id };
}

async function restaurarMysql(repositorio, tablas) {
  // Los polígonos de zonas son grandes: se insertan en lotes pequeños para no
  // superar max_allowed_packet ni provocar un corte de conexión.
  const tamanoLote = (tabla) => (tabla === 'zonas' ? 10 : tabla === 'municipios' ? 25 : 75);
  await repositorio.knex.transaction(async (trx) => {
    await trx.raw('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const [tabla, filas] of Object.entries(tablas)) {
        if (!(await trx.schema.hasTable(tabla))) continue;
        await trx(tabla).del();
        const lote = tamanoLote(tabla);
        for (let i = 0; i < filas.length; i += lote) {
          await trx(tabla).insert(filas.slice(i, i + lote));
        }
      }
    } finally {
      await trx.raw('SET FOREIGN_KEY_CHECKS = 1');
    }
  });
}

async function restaurarJson(repositorio, tablas) {
  for (const [coleccion, filas] of Object.entries(tablas)) {
    await repositorio.almacen.escribir(coleccion, filas);
  }
  repositorio.catalogo?.clear?.();
}

/** Restaura un respaldo después de crear uno previo. */
export async function restaurar(repositorio, actor, id, { confirmacion } = {}) {
  if (String(confirmacion || '').trim().toUpperCase() !== 'RESTAURAR') {
    throw AppError.solicitudInvalida('Escribe RESTAURAR para confirmar');
  }
  const respaldo = await repositorio.respaldoPorId(id);
  if (!respaldo) throw AppError.noEncontrado('Respaldo no encontrado');
  const ruta = path.join(CARPETA(), respaldo.archivo);
  const comprimido = await fs.readFile(ruta).catch(() => {
    throw AppError.noEncontrado('El archivo del respaldo no está disponible');
  });
  let json;
  try {
    json = gunzipSync(comprimido);
  } catch {
    throw AppError.solicitudInvalida('El archivo del respaldo está corrupto');
  }
  if (respaldo.hash && hash(json) !== respaldo.hash) {
    throw AppError.solicitudInvalida('El hash del respaldo no coincide; no se restauró nada');
  }
  let contenido;
  try {
    contenido = JSON.parse(json.toString('utf8'));
  } catch {
    throw AppError.solicitudInvalida('El respaldo no contiene JSON válido');
  }
  if (!contenido?.tablas || contenido.version !== 1) {
    throw AppError.solicitudInvalida('Versión de respaldo incompatible');
  }

  // Respaldo previo obligatorio antes de reemplazar datos.
  await crear(repositorio, actor, {
    tipo: 'previo_restauracion',
    nombre: `Antes de restaurar ${respaldo.nombre}`,
    incluirSimulados: true
  });

  if (repositorio.driver === 'mysql') await restaurarMysql(repositorio, contenido.tablas);
  else await restaurarJson(repositorio, contenido.tablas);

  const actualizado = await repositorio.actualizarRespaldo(id, {
    estado: 'restaurado',
    restauradoEn: new Date().toISOString()
  });
  await repositorio.crearEventoRespaldo({
    id: nuevoId(),
    respaldoId: id,
    tipo: 'restaurado',
    actor: actor?.username || null,
    detalle: `Restaurado con ${Object.keys(contenido.tablas).length} tablas`,
    creadoEn: new Date().toISOString()
  });
  return actualizado;
}

export async function estadisticas(repositorio) {
  const { respaldos, total } = await repositorio.respaldos({ limite: 100 });
  const listos = respaldos.filter((r) => r.estado === 'listo');
  const ultimo = listos[0] || null;
  const automaticos = respaldos.filter((r) => r.tipo === 'automatico' && r.estado === 'listo');
  const horas = Math.max(Number(await valorConfig(repositorio, 'respaldos.intervalo_horas')) || 24, 1);
  const siguienteAutomatico = automaticos[0]
    ? new Date(new Date(automaticos[0].creadoEn).getTime() + horas * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
  return {
    total,
    listos: listos.length,
    tamanoTotal: respaldos.reduce((suma, r) => suma + (Number(r.tamano) || 0), 0),
    ultimo,
    siguienteAutomatico,
    automaticos: automaticos.length,
    intervaloHoras: horas
  };
}

/** Aplica la retención configurada a los respaldos automáticos. */
export async function aplicarRetencion(repositorio, retencion) {
  const { respaldos } = await repositorio.respaldos({ tipo: 'automatico', limite: 500 });
  const sobrantes = respaldos.slice(Math.max(Number(retencion) || 7, 1));
  for (const respaldo of sobrantes) {
    await eliminar(repositorio, { username: 'sistema' }, respaldo.id);
  }
  return sobrantes.length;
}

/**
 * Worker de respaldos automáticos.
 *
 * Revisa cada 30 minutos si pasó el intervalo configurado. Si falla, solo
 * registra el error y avisa al administrador; nunca detiene el servidor.
 */
export function iniciarRespaldos(repositorio) {
  let ejecutando = false;

  const revisar = async () => {
    if (ejecutando) return;
    ejecutando = true;
    try {
      const activo = await valorConfig(repositorio, 'respaldos.activo');
      if (!activo) return;
      const horas = Math.max(
        Number(await valorConfig(repositorio, 'respaldos.intervalo_horas')) || 24,
        1
      );
      const { respaldos } = await repositorio.respaldos({
        tipo: 'automatico',
        estado: 'listo',
        limite: 1
      });
      const ultimo = respaldos[0];
      if (ultimo && Date.now() - new Date(ultimo.creadoEn).getTime() < horas * 60 * 60 * 1000) {
        return;
      }
      const retencion = Number(await valorConfig(repositorio, 'respaldos.retencion')) || 7;
      const creado = await crear(repositorio, { username: 'sistema' }, {
        tipo: 'automatico',
        nombre: `Respaldo automático ${new Date().toLocaleString('es-MX')}`,
        incluirSimulados: (await valorConfig(repositorio, 'respaldos.incluir_simulados')) === true
      });
      await aplicarRetencion(repositorio, retencion);
      await emitir(repositorio, {
        evento: 'respaldo_creado',
        titulo: '💾 Respaldo automático creado',
        mensaje: `${creado.nombre} · ${creado.archivo}`,
        severidad: 'info',
        entidadTipo: 'respaldo',
        entidadId: creado.id,
        url: '/?admin=respaldos',
        claveDedupe: `respaldo_creado:${creado.id}`
      }).catch(() => {});
    } catch (error) {
      console.error('[respaldos] no se pudo crear el respaldo automático:', error.message);
    } finally {
      ejecutando = false;
    }
  };

  const temporizador = setInterval(revisar, 30 * 60 * 1000);
  temporizador.unref?.();
  revisar().catch(() => {});
  return () => clearInterval(temporizador);
}
