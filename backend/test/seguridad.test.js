/**
 * Endurecimiento HTTP: cabeceras, política de contenidos, límites de cuerpo y
 * límites de peticiones.
 *
 * Este archivo activa el rate limiting a propósito (en el resto de la suite va
 * apagado para no interferir) y con cupos diminutos, de modo que se pueda
 * provocar el 429 sin hacer cientos de peticiones.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

process.env.RATE_LIMIT_ACTIVO = 'true';
process.env.RATE_LIMIT_MAX_AUTH = '3';
process.env.RATE_LIMIT_MAX_ANONIMO = '100';
process.env.RATE_LIMIT_MAX_REGISTRO = '100';
process.env.RATE_LIMIT_MAX_ESCRITURA = '100';
process.env.RATE_LIMIT_MAX_UPLOADS = '100';
process.env.RATE_LIMIT_MAX_GENERAL = '10000';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { config } = await import('../src/config/index.js');

const RAIZ_BACKEND = fileURLToPath(new URL('..', import.meta.url));

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

describe('Seguridad: cabeceras', () => {
  test('la aplicación se sirve con cabeceras de seguridad y sin x-powered-by', async () => {
    const r = await request(app).get('/');

    assert.equal(r.status, 200);
    assert.equal(r.headers['x-powered-by'], undefined);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['referrer-policy'], 'no-referrer');
    assert.match(r.headers['permissions-policy'], /geolocation=\(self\)/);
    assert.ok(r.headers['content-security-policy'], 'falta la Content-Security-Policy');
  });

  test('la política de contenidos no admite nada en línea', async () => {
    const csp = (await request(app).get('/')).headers['content-security-policy'];

    assert.doesNotMatch(csp, /unsafe-inline/, 'la CSP no debe admitir estilos ni scripts en línea');
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self'/);
    assert.match(csp, /style-src-attr 'none'/);
    assert.match(csp, /script-src-attr 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /base-uri 'self'/);
    // Las teselas del mapa son el único recurso de terceros que se permite.
    assert.match(csp, /server\.arcgisonline\.com/);
    assert.match(csp, /tile\.opentopomap\.org/);
  });

  test('la evidencia se sirve con cabeceras restrictivas', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoCabeceras');
    const subida = await anon
      .post('/api/uploads')
      .attach('archivos', PNG, { filename: 'cabecera.png', contentType: 'image/png' });
    assert.equal(subida.status, 201);

    const r = await request(app).get(subida.body.evidencia[0].url);
    assert.equal(r.status, 200);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.match(r.headers['content-security-policy'], /default-src 'none'/);
  });

  test('trust proxy no se confía en ninguna cabecera por omisión', () => {
    assert.equal(config.seguridad.trustProxy, false);
  });
});

describe('Seguridad: límites de cuerpo', () => {
  test('rechaza un cuerpo mayor del permitido con 413', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoCuerpo');
    const enorme = 'x'.repeat(2 * 1024 * 1024);

    const r = await anon.post('/api/incidencias', { titulo: enorme, descripcion: enorme });
    assert.equal(r.status, 413);
    assert.match(r.body.error, /demasiado grande/i);
  });

  test('el respaldo sí admite un cuerpo grande en /api/admin/importar', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoRespaldo');
    const enorme = 'x'.repeat(2 * 1024 * 1024);

    // Si el límite grande no se aplicara solo aquí, esto daría 413 antes de
    // llegar al controlador. Con sesión anónima lo que toca es 403.
    const r = await anon.post('/api/admin/importar', { datos: enorme });
    assert.equal(r.status, 403);
  });
});

describe('Seguridad: límite de peticiones', () => {
  test('la entrada con contraseña se corta con 429 tras varios intentos', async () => {
    const intento = () =>
      request(app).post('/api/auth/admin').send({ username: 'admin', password: 'incorrecta' });

    assert.equal((await intento()).status, 401);
    assert.equal((await intento()).status, 401);
    assert.equal((await intento()).status, 401);

    const cuarto = await intento();
    assert.equal(cuarto.status, 429);
    assert.match(cuarto.body.error, /demasiadas peticiones/i);
  });
});

describe('Seguridad: configuración', () => {
  test('un secreto por defecto se detecta como problema en producción', () => {
    const script =
      "import {problemasDeConfiguracion} from './src/config/index.js';" +
      'process.stdout.write(JSON.stringify(problemasDeConfiguracion()));';

    const salida = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: RAIZ_BACKEND,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        JWT_SECRET: 'secreto-de-desarrollo-cambiar-en-produccion',
        TRUST_PROXY: 'true'
      },
      encoding: 'utf8'
    });

    const problemas = JSON.parse(salida);
    assert.ok(problemas.some((p) => p.includes('JWT_SECRET')));
    assert.ok(problemas.some((p) => p.includes('TRUST_PROXY')));
  });
});
