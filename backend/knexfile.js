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
import mysql from 'mysql2/promise';
import { config } from './src/config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuración de tu base de datos
// ---------------------------------------------------------------------------
// Debe coincidir con `config.db.connection.database`; si aquí hubiera otro
// valor por omisión, las migraciones y la API apuntarían a bases distintas.
const DB_NAME = process.env.DB_NAME || 'incidencias';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || ''; // root sin contraseña

// El tamaño máximo de paquete se configura en el servidor MariaDB
// (--max-allowed-packet en compose.yaml) y no en el cliente: mysql2 ya no
// acepta esa opción en la conexión.

// ---------------------------------------------------------------------------
// Crea la base de datos si no existe (solo si el driver es MySQL)
// ---------------------------------------------------------------------------
async function ensureDatabaseExists() {
  if (config.db.client !== 'mysql2' && config.db.client !== 'mysql') return;

  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    // OJO: sin `database` para poder crear la BD
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`✅ Base de datos "${DB_NAME}" lista.`);
  } finally {
    await connection.end();
  }
}

// Knex exporta una promesa-friendly config; envolvemos en una función async
await ensureDatabaseExists();

// ---------------------------------------------------------------------------
// Configuración final de Knex
// ---------------------------------------------------------------------------
export default {
  client: 'mysql2',
  connection: {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    // Todas las fechas se guardan y se leen en UTC: la aplicación trabaja con
    // cadenas ISO y así no se desplazan por la zona horaria del servidor.
    timezone: 'Z',
    dateStrings: false,
    charset: 'utf8mb4'                  // <-- AÑADIDO (acentos y ñ correctos)
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
