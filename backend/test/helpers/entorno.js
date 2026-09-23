/**
 * Aísla cada archivo de pruebas: datos y subidas en un directorio temporal y,
 * cuando se prueba el driver MySQL, una base de datos propia por proceso.
 *
 * IMPORTANTE: debe llamarse ANTES de importar src/app.js (que lee la
 * configuración al cargarse). Por eso las pruebas usan `await import(...)`.
 *
 * Uso:
 *   npm test                                        → driver json
 *   STORAGE_DRIVER_TEST=mysql DB_PORT=3399 npm test → driver mysql
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function prepararEntorno() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'incidencias-test-'));
  const driver = (process.env.STORAGE_DRIVER_TEST || 'json').toLowerCase();

  process.env.NODE_ENV = 'test';
  process.env.STORAGE_DRIVER = driver;
  process.env.DATA_DIR = path.join(base, 'data');
  process.env.UPLOAD_DIR = path.join(base, 'uploads');
  process.env.JWT_SECRET = 'secreto-solo-para-pruebas';
  process.env.JWT_EXPIRES_IN = '1h';

  // Cada proceso de prueba usa su propia base de datos para no interferir.
  if (driver === 'mysql') {
    process.env.DB_NAME = `incidencias_test_${process.pid}`;
  }

  return {
    base,
    driver,
    data: process.env.DATA_DIR,
    uploads: process.env.UPLOAD_DIR,
    limpiar() {
      fs.rmSync(base, { recursive: true, force: true });
    }
  };
}

/**
 * Con el driver MySQL crea la base de datos del proceso y aplica migraciones y
 * semilla, de modo que la MISMA suite de pruebas corre contra los dos drivers.
 */
export async function prepararBaseDeDatos(entorno) {
  if (entorno.driver !== 'mysql') return;

  const knexFactory = (await import('knex')).default;
  const { default: configKnex } = await import('../../knexfile.js');
  const nombre = configKnex.connection.database;

  const administrador = knexFactory({
    client: configKnex.client,
    connection: { ...configKnex.connection, database: undefined }
  });
  try {
    await administrador.raw(`DROP DATABASE IF EXISTS \`${nombre}\``);
    await administrador.raw(
      `CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await administrador.destroy();
  }

  const base = knexFactory(configKnex);
  try {
    await base.migrate.latest();
    await base.seed.run();
  } finally {
    await base.destroy();
  }
}
