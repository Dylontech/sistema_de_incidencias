/**
 * Configuración central del backend.
 * Lee variables de entorno (.env) y resuelve las rutas absolutas del proyecto.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { EVIDENCIA_POLITICA } from './constantes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** backend/ */
export const backendRoot = path.resolve(__dirname, '../..');
/** Raíz del repositorio (contiene backend/ y frontend/) */
export const projectRoot = path.resolve(backendRoot, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const ruta = (valor, porDefecto) => path.resolve(backendRoot, valor || porDefecto);

const MB = 1024 * 1024;

/** Secreto de desarrollo: en producción se rechaza al arrancar (ver validarConfiguracion). */
export const SECRETO_POR_DEFECTO = 'secreto-de-desarrollo-cambiar-en-produccion';

/** Lee un booleano de entorno: vacío -> porDefecto; 'false'/'0'/'no'/'off' -> false. */
function activo(valor, porDefecto) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return porDefecto;
  return !['false', '0', 'no', 'off'].includes(String(valor).trim().toLowerCase());
}

/**
 * Valor de `trust proxy` para Express.
 *
 * Por omisión NO se confía en ninguna cabecera X-Forwarded-*: si la aplicación
 * se publica directamente (docker compose), quien habla con Express es el
 * cliente y `req.ip` ya es correcto. Detrás de un proxy inverso hay que
 * declararlo (TRUST_PROXY=1, o la lista de IPs/CIDR). Ponerlo a `true` sin más
 * permitiría falsear la IP con una cabecera y, con ella, los límites de
 * peticiones.
 */
function valorTrustProxy() {
  const bruto = String(process.env.TRUST_PROXY ?? '').trim();
  if (bruto === '' || bruto.toLowerCase() === 'false') return false;
  if (bruto.toLowerCase() === 'true') return true;
  const saltos = Number(bruto);
  return Number.isInteger(saltos) && saltos >= 0 ? saltos : bruto;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),

  jwt: {
    secret: process.env.JWT_SECRET || SECRETO_POR_DEFECTO,
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  },

  /**
   * 'mysql' (MariaDB vía Knex, por defecto) | 'json' (archivos en disco).
   * El driver JSON se conserva para desarrollo sin base de datos y para las
   * pruebas: basta STORAGE_DRIVER=json.
   */
  storageDriver: (process.env.STORAGE_DRIVER || 'mysql').toLowerCase(),

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
    // Solo fotografías: el video se retiró del formulario y del servidor.
    // Los valores por omisión salen de la política, para no repetir el número.
    maxFotoBytes: Number(process.env.MAX_FOTO_BYTES || EVIDENCIA_POLITICA.maxFotoBytes),
    // Tope del conjunto de una misma carga (multer solo limita archivo a archivo).
    maxCargaBytes: Number(process.env.MAX_CARGA_BYTES || EVIDENCIA_POLITICA.maxCargaBytes)
  },

  /**
   * Endurecimiento HTTP. Todo configurable por entorno para poder aflojarlo en
   * desarrollo sin tocar código (ver .env.example).
   */
  seguridad: {
    trustProxy: valorTrustProxy(),

    /**
     * 'estricto' (por omisión): la CSP no admite estilos en línea, así que todo
     * el marcado usa clases y los valores dinámicos se aplican por CSSOM.
     * 'laxo': añade 'unsafe-inline' a los estilos (solo para depurar).
     */
    cspModo: (process.env.CSP_MODO || 'estricto').toLowerCase(),

    /**
     * Solo cuando la aplicación se sirve por HTTPS (proxy inverso con TLS).
     * Activa HSTS y upgrade-insecure-requests; con la app en HTTP a secas esos
     * dos cabeceras dejarían la interfaz sin estilos, así que van apagadas.
     */
    asumirHttps: activo(process.env.ASUMIR_HTTPS, false),

    // Cuerpo JSON que acepta la API. El respaldo del monolito va con base64 y es
    // la única ruta que necesita un límite grande (se aplica solo en /admin/importar).
    maxJsonBytes: Number(process.env.MAX_JSON_BYTES || 1 * MB),
    maxImportacionBytes: Number(process.env.MAX_IMPORTACION_BYTES || 100 * MB),

    rateLimit: {
      // En pruebas nunca se limita (la suite hace cientos de peticiones); en
      // cualquier otro entorno sí, salvo que RATE_LIMIT_ACTIVO=false.
      activo: activo(process.env.RATE_LIMIT_ACTIVO, (process.env.NODE_ENV || 'development') !== 'test'),
      ventanaMs: Number(process.env.RATE_LIMIT_VENTANA_MS || 15 * 60 * 1000),
      // Suficiente para el refresco de 60 s y para el panel con informes.
      maxGeneral: Number(process.env.RATE_LIMIT_MAX_GENERAL || 900),
      // Entradas: fuerza bruta de contraseñas (por IP).
      maxAuth: Number(process.env.RATE_LIMIT_MAX_AUTH || 10),
      // Alta de cuentas y de sesiones anónimas: frenan el spam de cuentas.
      maxRegistro: Number(process.env.RATE_LIMIT_MAX_REGISTRO || 5),
      maxAnonimo: Number(process.env.RATE_LIMIT_MAX_ANONIMO || 20),
      // Escritura de contenido (por cuenta/sesión): reportes, comentarios, denuncias.
      maxEscritura: Number(process.env.RATE_LIMIT_MAX_ESCRITURA || 20),
      // Subida de evidencia (por cuenta/sesión).
      maxUploads: Number(process.env.RATE_LIMIT_MAX_UPLOADS || 30)
    }
  },

  /**
   * Correo saliente: verificación de la cuenta y recuperación de contraseña.
   *
   * Con `SMTP_HOST` se envía de verdad (por `nodemailer`); sin él los mensajes
   * se escriben en el registro del servidor, que es lo cómodo en desarrollo
   * (no hace falta un servidor de correo para probar el flujo completo).
   */
  correo: {
    host: process.env.SMTP_HOST || '',
    puerto: Number(process.env.SMTP_PORT || 587),
    seguro: activo(process.env.SMTP_SEGURO, false),
    usuario: process.env.SMTP_USUARIO || '',
    password: process.env.SMTP_PASSWORD || '',
    remitente: process.env.SMTP_REMITENTE || 'Incidencias Municipales <no-responder@localhost>',
    /** Base de los enlaces que viajan en el correo (sin barra final). */
    urlBase: String(process.env.URL_PUBLICA || `http://localhost:${Number(process.env.PORT || 3000)}`)
      .trim()
      .replace(/\/+$/, '')
  },

  /** Cuentas ciudadanas: verificación del correo, sesiones y bloqueos. */
  cuenta: {
    /** ¿Hace falta el correo verificado para entrar? */
    exigirCorreoVerificado: activo(process.env.EXIGIR_CORREO_VERIFICADO, true),
    minutosVerificacion: Number(process.env.CORREO_VERIFICACION_MIN || 24 * 60),
    minutosRestablecimiento: Number(process.env.CORREO_RESTABLECIMIENTO_MIN || 60),
    /** Intentos fallidos por cuenta antes de bloquearla temporalmente. */
    intentosMaximos: Number(process.env.INTENTOS_MAXIMOS || 8),
    minutosBloqueo: Number(process.env.MINUTOS_BLOQUEO || 15)
  },

  /** Cada cuánto se recalculan las alertas por antigüedad (paridad: 60 s). */
  intervaloAlertasMs: Number(process.env.INTERVALO_ALERTAS_MS || 60000)
};

export const esProduccion = () => config.env === 'production';

/**
 * Revisa la configuración antes de escuchar. Devuelve la lista de problemas
 * (vacía = todo correcto) para que el arranque pueda explicarlos juntos en
 * lugar de fallar por el primero.
 */
export function problemasDeConfiguracion() {
  const problemas = [];

  if (config.jwt.secret === SECRETO_POR_DEFECTO) {
    problemas.push('JWT_SECRET usa el valor de desarrollo conocido (válido solo para probar).');
  }

  if (esProduccion()) {
    if (config.jwt.secret === SECRETO_POR_DEFECTO || config.jwt.secret.length < 32) {
      problemas.push(
        'JWT_SECRET debe ser una cadena larga y aleatoria (32 caracteres o más) en producción.'
      );
    }
    if (config.storageDriver === 'mysql' && !config.db.connection.password) {
      problemas.push('DB_PASSWORD está vacío: la base de datos quedaría sin contraseña.');
    }
    if (config.seguridad.trustProxy === true) {
      problemas.push(
        'TRUST_PROXY no puede ser "true" en producción: indica el número de saltos ' +
          '(TRUST_PROXY=1) o la lista de IPs del proxy.'
      );
    }
  }

  return problemas;
}

/** Avisos que no impiden arrancar, pero conviene leer. */
export function avisosDeConfiguracion() {
  const avisos = [];

  if (esProduccion() && !config.seguridad.asumirHttps) {
    avisos.push(
      'La aplicación se servirá por HTTP. Ponle un proxy con TLS delante y define ' +
        'ASUMIR_HTTPS=true para activar HSTS y upgrade-insecure-requests.'
    );
  }

  if (esProduccion() && config.storageDriver === 'json') {
    avisos.push('STORAGE_DRIVER=json en producción: los datos son archivos locales, sin base de datos.');
  }

  if (!config.seguridad.rateLimit.activo) {
    avisos.push('El límite de peticiones está desactivado (RATE_LIMIT_ACTIVO=false).');
  }

  if (config.seguridad.cspModo !== 'estricto') {
    avisos.push(`CSP_MODO=${config.seguridad.cspModo}: la política de contenidos admite estilos en línea.`);
  }

  if (!config.correo.host) {
    avisos.push(
      'SMTP_HOST no está definido: los correos de verificación y de recuperación de ' +
        'contraseña se escriben en el registro en lugar de enviarse.'
    );
  } else if (!/^https?:\/\//.test(config.correo.urlBase)) {
    avisos.push(`URL_PUBLICA no parece una dirección: ${config.correo.urlBase}`);
  }

  if (esProduccion() && !config.cuenta.exigirCorreoVerificado) {
    avisos.push('EXIGIR_CORREO_VERIFICADO=false: se puede entrar con un correo sin confirmar.');
  }

  return avisos;
}

/** Configuración efectiva para los registros de arranque, sin secretos. */
export function resumenConfiguracion() {
  return {
    env: config.env,
    puerto: config.port,
    almacen: config.storageDriver,
    trustProxy: config.seguridad.trustProxy,
    csp: config.seguridad.cspModo,
    limitePeticiones: config.seguridad.rateLimit.activo ? 'activo' : 'desactivado'
  };
}
