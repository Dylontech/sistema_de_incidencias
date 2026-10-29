/** Métricas del servidor: solo admin y forma esperada. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

describe('Métricas del servidor', () => {
  test('el admin recibe CPU, memoria, disco y contadores', async () => {
    const admin = await Api.admin(app);
    const r = await admin.get('/api/admin/metricas');
    assert.equal(r.status, 200);
    assert.ok(r.body.memoria.rss > 0);
    assert.ok(r.body.cpu.nucleos > 0);
    assert.ok(r.body.peticiones.total > 0);
    // `statfs` no está disponible en todos los sistemas (por ejemplo Windows);
    // el campo puede ser null, pero debe existir.
    assert.ok('disco' in r.body);
    assert.equal(typeof r.body.eventLoopLagMs, 'number');
  });

  test('el funcionario no puede verlas', async () => {
    const funcionario = await Api.funcionario(app);
    assert.equal((await funcionario.get('/api/admin/metricas')).status, 403);
    assert.equal((await funcionario.get('/api/admin/metricas/historico')).status, 403);
  });

  test('el histórico devuelve las muestras tomadas', async () => {
    const admin = await Api.admin(app);
    await admin.get('/api/admin/metricas');
    const r = await admin.get('/api/admin/metricas/historico');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.muestras));
    assert.ok(r.body.muestras.length >= 1);
    assert.ok('cpu' in r.body.muestras[0]);
  });
});
