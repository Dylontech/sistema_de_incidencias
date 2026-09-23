/**
 * Configuración central del backend.
 * Lee variables de entorno (.env) y resuelve las rutas absolutas del proyecto.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** backend/ */
export const backendRoot = path.resolve(__dirname, '../..');
/** Raíz del repositorio (contiene backend/ y frontend/) */
export const projectRoot = path.resolve(backendRoot, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const ruta = (valor, porDefecto) => path.resolve(backendRoot, valor || porDefecto);

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),

  jwt: {
    secret: process.env.JWT_SECRET || 'secreto-de-desarrollo-cambiar-en-produccion',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  },

  /** 'json' (archivos en disco) | 'mysql' (Knex) */
  storageDriver: (process.env.STORAGE_DRIVER || 'json').toLowerCase(),

  paths: {
    data: ruta(process.env.DATA_DIR, 'data'),
    uploads: ruta(process.env.UPLOAD_DIR, 'uploads'),
    seedData: path.join(__dirname, 'seed-data'),
    frontend: path.join(projectRoot, 'frontend'),
    legacy: path.join(projectRoot, 'legacy')
  },

  db: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'incidencias',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'incidencias',
      charset: process.env.DB_CHARSET || 'utf8mb4'
    }
  },

  evidencia: {
    maxFotoBytes: Number(process.env.MAX_FOTO_BYTES || 100 * 1024 * 1024),
    maxVideoBytes: Number(process.env.MAX_VIDEO_BYTES || 1024 * 1024 * 1024),
    maxVideoSegundos: Number(process.env.MAX_VIDEO_SEG || 300)
  },

  /** Cada cuánto se recalculan las alertas por antigüedad (paridad: 60 s). */
  intervaloAlertasMs: Number(process.env.INTERVALO_ALERTAS_MS || 60000)
};

export const esProduccion = () => config.env === 'production';
