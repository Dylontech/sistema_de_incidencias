/**
 * Espera a que la base de datos acepte conexiones.
 *
 * Lo usa `docker/entrypoint.sh` antes de aplicar las migraciones. `depends_on`
 * con `service_healthy` ya espera a MariaDB, pero esto cubre además los
 * reinicios y los `docker compose up` de un solo servicio. A propósito NO mira
 * las tablas: de crearlas se encargan las migraciones que vienen después.
 *
 *   ESPERA_INTENTOS=30 ESPERA_MS=2000 node scripts/esperar-base.mjs
 */
import knexFactory from 'knex';
import { config } from '../src/config/index.js';

const intentos = Number(process.env.ESPERA_INTENTOS || 30);
const esperaMs = Number(process.env.ESPERA_MS || 2000);
const { host, port, database } = config.db.connection;

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

if (config.storageDriver !== 'mysql') {
  console.log(`[esperar-base] sin nada que esperar: el driver es ${config.storageDriver}.`);
  process.exit(0);
}

const conexion = knexFactory({
  client: config.db.client,
  connection: config.db.connection,
  pool: { min: 0, max: 1 }
});

let lista = false;
let ultimoError = '';

try {
  for (let intento = 1; intento <= intentos && !lista; intento += 1) {
    try {
      await conexion.raw('select 1 as ok');
      lista = true;
    } catch (error) {
      ultimoError = error.message;
      console.log(
        `[esperar-base] ${intento}/${intentos} en ${host}:${port} sin respuesta (${error.code || error.message})`
      );
      if (intento < intentos) await dormir(esperaMs);
    }
  }
} finally {
  await conexion.destroy();
}

if (!lista) {
  console.error(
    `[esperar-base] ${database} en ${host}:${port} no respondió tras ${intentos} intentos.`
  );
  console.error(`[esperar-base] último error: ${ultimoError}`);
  process.exit(1);
}

console.log(`[esperar-base] ${database} en ${host}:${port} responde.`);
