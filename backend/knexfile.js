/**
 * Configuración de Knex.
 *
 *   npm --prefix backend run migrate
 *   npm --prefix backend run seed
 *
 * El driver MySQL se activa con STORAGE_DRIVER=mysql en .env; el driver por
 * defecto sigue siendo `json` (archivos en disco).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './src/config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  client: config.db.client,
  connection: {
    ...config.db.connection,
    // Todas las fechas se guardan y se leen en UTC: la aplicación trabaja con
    // cadenas ISO y así no se desplazan por la zona horaria del servidor.
    timezone: 'Z',
    dateStrings: false
  },
  pool: { min: 0, max: 10 },
  migrations: {
    directory: path.join(__dirname, 'db/migrations'),
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: path.join(__dirname, 'db/seeds')
  }
};
