/**
 * Prepara MariaDB para las pruebas y ejecuta la suite con migraciones
 * automáticas.
 *
 *   node scripts/pruebas-mysql.mjs
 *   node scripts/pruebas-mysql.mjs --archivo=test/cuentas.test.js
 *   node scripts/pruebas-mysql.mjs --local
 *   node scripts/pruebas-mysql.mjs --preparar [--semilla] [--limpia]
 *   node scripts/pruebas-mysql.mjs --mantener
 *   node scripts/pruebas-mysql.mjs --bajar
 *
 * Con Docker usa compose.test.yaml (127.0.0.1:3399, root/pruebas, tmpfs). Si
 * Docker no está disponible, detecta un MariaDB/MySQL local (por omisión
 * 127.0.0.1:3306 con root sin contraseña) y lo usa sin tocar la base
 * `incidencias`: las pruebas crean sus propias `incidencias_test_<pid>`.
 *
 * Cada archivo de prueba crea su base, ejecuta `migrate.latest()` +
 * `seed.run()` desde `test/helpers/entorno.js`. `--preparar` crea
 * `incidencias_pruebas` y aplica las migraciones para validar la API a mano.
 *
 * El runner es multiplataforma (PowerShell, cmd, sh): usa `node --test` y
 * `docker compose` directamente, sin depender de `sh` ni de `npm.cmd`.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(AQUI, '..');
const RAIZ = path.resolve(BACKEND, '..');
const COMPOSE = path.join(RAIZ, 'compose.test.yaml');
const BASE_PREPARADA = 'incidencias_pruebas';

const args = process.argv.slice(2);
const opciones = {
  archivo: null,
  preparar: args.includes('--preparar'),
  semilla: args.includes('--semilla'),
  mantener: args.includes('--mantener'),
  bajar: args.includes('--bajar'),
  paralelo: args.includes('--paralelo'),
  local: args.includes('--local'),
  docker: args.includes('--docker'),
  limpia: args.includes('--limpia')
};
const posicional = args.find((arg) => !arg.startsWith('--'));
if (posicional) opciones.archivo = posicional;
for (const arg of args) {
  if (arg.startsWith('--archivo=')) opciones.archivo = arg.slice('--archivo='.length);
}

const configuracion = {
  host: process.env.DB_HOST || '127.0.0.1',
  puerto: Number(process.env.DB_PORT || 0),
  usuario: process.env.DB_USER || 'root',
  clave: process.env.DB_PASSWORD
};

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

function hayDocker() {
  const resultado = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' });
  return !resultado.error && resultado.status === 0;
}

async function baseDisponible() {
  const mysql = (await import('mysql2/promise')).default;
  try {
    const conexion = await mysql.createConnection({
      host: configuracion.host,
      port: configuracion.puerto || Number(process.env.DB_PORT || 3306),
      user: configuracion.usuario,
      password: configuracion.clave ?? '',
      connectTimeout: 1500
    });
    await conexion.end();
    return true;
  } catch {
    return false;
  }
}

async function resolverModo() {
  if (opciones.local) return 'local';
  if (opciones.docker) return 'docker';
  if (hayDocker()) return 'docker';
  if (await baseDisponible()) {
    console.warn('[pruebas-mysql] Docker no está disponible; se usará el MariaDB local.');
    return 'local';
  }
  return 'docker';
}

const modo = await resolverModo();
if (!configuracion.puerto) configuracion.puerto = modo === 'local' ? 3306 : 3399;
if (configuracion.clave === undefined) configuracion.clave = modo === 'local' ? '' : 'pruebas';

function correr(comando, argumentos, opcionesSpawn = {}) {
  const resultado = spawnSync(comando, argumentos, {
    cwd: RAIZ,
    stdio: 'inherit',
    ...opcionesSpawn
  });
  if (resultado.error?.code === 'ENOENT') {
    console.error(
      `[pruebas-mysql] no se encontró "${comando}". Instala Docker Desktop y comprueba que esté en el PATH.`
    );
    return 127;
  }
  if (resultado.error) throw resultado.error;
  return resultado.status ?? 0;
}

function compose(argumentos) {
  return correr('docker', ['compose', '-f', COMPOSE, ...argumentos]);
}

async function esperarBase() {
  const mysql = (await import('mysql2/promise')).default;
  for (let intento = 1; intento <= 60; intento += 1) {
    try {
      const conexion = await mysql.createConnection({
        host: configuracion.host,
        port: configuracion.puerto,
        user: configuracion.usuario,
        password: configuracion.clave
      });
      try {
        await conexion.query('SELECT 1');
        return;
      } finally {
        await conexion.end();
      }
    } catch {
      if (intento === 60) {
        throw new Error(`MariaDB no respondió en ${configuracion.host}:${configuracion.puerto}`);
      }
      await dormir(1000);
    }
  }
}

async function levantar() {
  if (modo === 'local') {
    console.log(
      `[pruebas-mysql] usando MariaDB local en ${configuracion.host}:${configuracion.puerto}…`
    );
    await esperarBase();
    return 0;
  }

  console.log('[pruebas-mysql] levantando mariadb-test…');
  let estado = compose(['up', '-d', '--wait']);
  if (estado !== 0) {
    console.warn('[pruebas-mysql] `up --wait` falló; se reintenta con sondeo de la base…');
    estado = compose(['up', '-d']);
    if (estado !== 0) return estado;
    await esperarBase();
  }
  return 0;
}

function bajar() {
  if (modo === 'local') {
    console.log('[pruebas-mysql] modo local: no hay contenedor que bajar.');
    return;
  }
  console.log('[pruebas-mysql] bajando mariadb-test…');
  compose(['down']);
}

function archivosDePrueba(filtro) {
  const directorio = path.join(BACKEND, 'test');
  if (filtro) {
    const candidatos = [
      path.resolve(BACKEND, filtro),
      path.resolve(directorio, filtro),
      `${path.resolve(directorio, filtro)}.js`
    ];
    const encontrado = candidatos.find((ruta) => fs.existsSync(ruta) && fs.statSync(ruta).isFile());
    if (!encontrado) {
      console.error(`[pruebas-mysql] no se encontró el archivo de pruebas "${filtro}".`);
      return [];
    }
    return [encontrado];
  }
  return fs
    .readdirSync(directorio)
    .filter((nombre) => nombre.endsWith('.test.js'))
    .sort()
    .map((nombre) => path.join(directorio, nombre));
}

async function ejecutarPruebas(filtro) {
  const archivos = archivosDePrueba(filtro);
  if (!archivos.length) return 1;

  const entorno = {
    ...process.env,
    NODE_ENV: 'test',
    STORAGE_DRIVER_TEST: 'mysql',
    DB_HOST: configuracion.host,
    DB_PORT: String(configuracion.puerto),
    DB_USER: configuracion.usuario,
    DB_PASSWORD: configuracion.clave,
    // La suite ya desactiva los límites en NODE_ENV=test; se explicita para
    // que un .env cargado por error no cambie el resultado.
    RATE_LIMIT_ACTIVO: 'false'
  };

  const argumentos = ['--test'];
  // La semilla del catálogo es costosa y cada archivo abre su propio pool:
  // en paralelo se agotan las conexiones de MariaDB.
  if (!opciones.paralelo) argumentos.push('--test-concurrency=1');
  argumentos.push(...archivos);

  console.log(
    `[pruebas-mysql] ejecutando ${archivos.length} archivo(s) contra MariaDB en ${configuracion.host}:${configuracion.puerto}…`
  );

  const hijo = spawn(process.execPath, argumentos, {
    cwd: BACKEND,
    stdio: 'inherit',
    env: entorno
  });

  return new Promise((resolver) => {
    hijo.on('error', (error) => {
      console.error('[pruebas-mysql] no se pudo ejecutar node --test:', error.message);
      resolver(1);
    });
    hijo.on('exit', (codigo, senal) => resolver(codigo ?? (senal ? 1 : 0)));
  });
}

async function prepararBase() {
  process.env.NODE_ENV = 'test';
  process.env.STORAGE_DRIVER = 'mysql';
  process.env.DB_HOST = configuracion.host;
  process.env.DB_PORT = String(configuracion.puerto);
  process.env.DB_USER = configuracion.usuario;
  process.env.DB_PASSWORD = configuracion.clave;
  process.env.DB_NAME = BASE_PREPARADA;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';

  if (opciones.limpia) {
    if (!BASE_PREPARADA.endsWith('_pruebas')) {
      throw new Error(`Por seguridad no se limpia la base ${BASE_PREPARADA}`);
    }
    const mysql = (await import('mysql2/promise')).default;
    const admin = await mysql.createConnection({
      host: configuracion.host,
      port: configuracion.puerto,
      user: configuracion.usuario,
      password: configuracion.clave
    });
    try {
      console.log(`[pruebas-mysql] eliminando ${BASE_PREPARADA} (--limpia)…`);
      await admin.query(`DROP DATABASE IF EXISTS \`${BASE_PREPARADA}\``);
    } finally {
      await admin.end();
    }
  }

  // knexfile.js crea la base si no existe y lee la configuración al importarse.
  const { default: configKnex } = await import('../knexfile.js');
  const knexFactory = (await import('knex')).default;
  const base = knexFactory(configKnex);

  try {
    console.log('[pruebas-mysql] aplicando migraciones pendientes…');
    const [lote, migraciones] = await base.migrate.latest();
    console.log(
      migraciones.length
        ? `[pruebas-mysql] ${migraciones.length} migración(es) aplicadas (lote ${lote}).`
        : '[pruebas-mysql] no había migraciones pendientes.'
    );

    if (opciones.semilla) {
      console.log('[pruebas-mysql] ejecutando la semilla (destructiva)…');
      await base.seed.run();
      console.log('[pruebas-mysql] semilla aplicada.');
    }

    const [filas] = await base.raw('SELECT COUNT(*) AS total FROM knex_migrations');
    console.log(`[pruebas-mysql] migraciones registradas: ${filas[0].total}`);
  } finally {
    await base.destroy();
  }

  console.log(
    [
      '',
      '[pruebas-mysql] entorno listo:',
      `  STORAGE_DRIVER=mysql`,
      `  DB_HOST=${configuracion.host}`,
      `  DB_PORT=${configuracion.puerto}`,
      `  DB_USER=${configuracion.usuario}`,
      `  DB_PASSWORD=${configuracion.clave}`,
      `  DB_NAME=${BASE_PREPARADA}`,
      '',
      modo === 'docker'
        ? 'Detén el contenedor con: npm run db:pruebas:down'
        : 'El servicio local sigue en marcha; no hay contenedor que detener.',
      ''
    ].join('\n')
  );
}

let contenedorArriba = false;
const bajarAlSalir = () =>
  contenedorArriba && !opciones.mantener && !opciones.preparar ? bajar() : undefined;

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    bajarAlSalir();
    process.exit(1);
  });
}

try {
  if (opciones.bajar) {
    bajar();
  } else {
    const estado = await levantar();
    if (estado !== 0) {
      process.exitCode = estado || 1;
    } else {
      contenedorArriba = modo === 'docker';
      if (opciones.preparar) {
        await prepararBase();
      } else {
        process.exitCode = await ejecutarPruebas(opciones.archivo);
      }
    }
  }
} catch (error) {
  console.error(`[pruebas-mysql] ${error.message}`);
  process.exitCode = 1;
} finally {
  bajarAlSalir();
}
