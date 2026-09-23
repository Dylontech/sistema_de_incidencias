/**
 * Elimina las bases de datos temporales que crea la suite de pruebas cuando se
 * ejecuta contra MySQL (test/helpers/entorno.js crea `incidencias_test_<pid>`).
 *
 *   npm --prefix backend run limpiar-bases-prueba
 */
import knexFactory from 'knex';
import { config } from '../src/config/index.js';

const PREFIJO = process.env.DB_TEST_PREFIX || 'incidencias_test';

const admin = knexFactory({
  client: config.db.client,
  connection: { ...config.db.connection, database: undefined }
});

try {
  const filas = await admin.raw(
    'SELECT schema_name AS nombre FROM information_schema.schemata WHERE schema_name LIKE ?',
    [`${PREFIJO}%`]
  );
  const nombres = (filas[0] || []).map((f) => f.nombre);

  for (const nombre of nombres) {
    await admin.raw(`DROP DATABASE \`${nombre}\``);
  }

  console.log(
    nombres.length
      ? `Bases de prueba eliminadas (${nombres.length}): ${nombres.join(', ')}`
      : 'No había bases de prueba que eliminar.'
  );
} finally {
  await admin.destroy();
}
