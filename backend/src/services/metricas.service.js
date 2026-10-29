/**
 * SERVICIO: métricas del proceso y del servidor.
 *
 * No usa dependencias externas (ni Prometheus): un contador de peticiones, un
 * histograma de latencias y una muestra periódica de CPU, memoria, disco y
 * event loop. El histórico vive en memoria (últimas 6 horas) para no escribir
 * en la base en cada muestra; se pierde al reiniciar, que es aceptable para un
 * panel operativo.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { config } from '../config/index.js';

const histograma = monitorEventLoopDelay({ resolution: 20 });
histograma.enable();

const estado = {
  peticiones: 0,
  porEstado: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
  latenciaTotalMs: 0,
  latenciaMaxMs: 0
};

const historico = [];
const MAX_MUESTRAS = 360;

let cpuAnterior = process.cpuUsage();
let fechaCpuAnterior = process.hrtime.bigint();

/** Middleware que cuenta peticiones y latencia por respuesta. */
export function instrumentar(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    estado.peticiones += 1;
    estado.latenciaTotalMs += ms;
    estado.latenciaMaxMs = Math.max(estado.latenciaMaxMs, ms);
    const clase = `${Math.floor(res.statusCode / 100)}xx`;
    if (estado.porEstado[clase] !== undefined) estado.porEstado[clase] += 1;
  });
  next();
}

async function tamanoDirectorio(directorio) {
  let total = 0;
  try {
    const entradas = await fs.readdir(directorio, { withFileTypes: true });
    for (const entrada of entradas) {
      const ruta = `${directorio}/${entrada.name}`;
      try {
        if (entrada.isDirectory()) total += await tamanoDirectorio(ruta);
        else total += (await fs.stat(ruta)).size;
      } catch {
        /* archivo borrado durante el recorrido */
      }
    }
  } catch {
    return 0;
  }
  return total;
}

async function disco() {
  try {
    const info = await fs.statfs(config.paths.uploads);
    const total = Number(info.blocks) * Number(info.bsize);
    const libre = Number(info.bavail) * Number(info.bsize);
    return { total, libre, usado: total - libre };
  } catch {
    return null;
  }
}

function cpuPorcentaje() {
  const ahora = process.hrtime.bigint();
  const uso = process.cpuUsage(cpuAnterior);
  const transcurridoUs = Number(ahora - fechaCpuAnterior) / 1000;
  cpuAnterior = process.cpuUsage();
  fechaCpuAnterior = ahora;
  if (!transcurridoUs) return 0;
  return Number((((uso.user + uso.system) / transcurridoUs) * 100).toFixed(1));
}

/** Muestra completa para el panel. */
export async function muestra(repositorio) {
  const memoria = process.memoryUsage();
  const cpu = os.cpus();
  const pool = repositorio?.knex?.client?.pool;

  const datos = {
    fecha: new Date().toISOString(),
    uptimeSegundos: Math.round(process.uptime()),
    cpu: {
      proceso: cpuPorcentaje(),
      nucleos: cpu.length,
      modelo: cpu[0]?.model || 'desconocido',
      carga: os.loadavg().map((n) => Number(n.toFixed(2)))
    },
    memoria: {
      rss: memoria.rss,
      heapUsado: memoria.heapUsed,
      heapTotal: memoria.heapTotal,
      externa: memoria.external,
      sistemaTotal: os.totalmem(),
      sistemaLibre: os.freemem()
    },
    eventLoopLagMs: Number((histograma.mean / 1e6).toFixed(2)),
    peticiones: { ...estado.porEstado, total: estado.peticiones },
    latencia: {
      mediaMs: estado.peticiones ? Number((estado.latenciaTotalMs / estado.peticiones).toFixed(1)) : 0,
      maximaMs: Number(estado.latenciaMaxMs.toFixed(1))
    },
    baseDatos: pool
      ? {
          usadas: pool.numUsed?.() ?? null,
          libres: pool.numFree?.() ?? null,
          pendientes: pool.numPendingAcquires?.() ?? null,
          total: (pool.numUsed?.() || 0) + (pool.numFree?.() ?? 0)
        }
      : null,
    disco: await disco(),
    uploadsBytes: await tamanoDirectorio(config.paths.uploads),
    configuracion: {
      entorno: config.env,
      almacen: config.storageDriver,
      correoActivo: config.correo.activo && !config.correo.dryRun && Boolean(config.correo.host)
    }
  };

  historico.push({
    fecha: datos.fecha,
    cpu: datos.cpu.proceso,
    rss: datos.memoria.rss,
    lag: datos.eventLoopLagMs
  });
  if (historico.length > MAX_MUESTRAS) historico.shift();

  return datos;
}

/** Histórico de las últimas muestras (como máximo 6 h a 1/min). */
export function historicoMuestras() {
  return historico.slice();
}

/** Toma una muestra cada minuto para que el histórico no dependa de la UI. */
export function iniciarMuestreo(repositorio, { intervaloMs = 60000 } = {}) {
  const temporizador = setInterval(() => {
    muestra(repositorio).catch(() => {});
  }, intervaloMs);
  temporizador.unref?.();
  return () => clearInterval(temporizador);
}
