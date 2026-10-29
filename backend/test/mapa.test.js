/** Endpoint ligero del mapa: filtros geográficos, alcance y agrupación. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, PUNTO_MARAVATIO, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

describe('Mapa ligero', () => {
  test('devuelve puntos sin evidencias ni comentarios y respeta el bbox', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoMapa1');
    const creada = await anon.post('/api/incidencias', incidenciaValida());
    assert.equal(creada.status, 201, creada.body?.error);

    const dentro = await anon.get(
      '/api/incidencias/mapa?bbox=-100.6,19.7,-100.2,20.1&cluster=1'
    );
    assert.equal(dentro.status, 200);
    assert.ok(dentro.body.total >= 1);
    assert.ok(dentro.body.puntos.length >= 1);

    const punto = dentro.body.puntos.find((p) => p.id === creada.body.incidencia.id);
    // Con una sola incidencia en la celda llega como punto, no como clúster.
    assert.ok(punto);
    assert.equal(punto.descripcion, undefined);
    assert.equal(punto.comentarios, undefined);
    assert.equal(punto.evidencia, undefined);
    assert.ok(typeof punto.resumen === 'string');

    const fuera = await anon.get('/api/incidencias/mapa?bbox=-99.3,19.2,-99.0,19.6');
    assert.equal(fuera.status, 200);
    assert.equal(fuera.body.total, 0);
  });

  test('el funcionario no recibe puntos de otro municipio', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoMapa2');
    const propia = await anon.post('/api/incidencias', incidenciaValida());
    assert.equal(propia.status, 201, propia.body?.error);

    const funcionario = await Api.funcionario(app);
    const datos = await funcionario.get('/api/incidencias/mapa?municipio=16050');
    assert.equal(datos.status, 200);
    assert.ok(datos.body.puntos.every((p) => p.municipioId === '16050'));

    const ajeno = await funcionario.get('/api/incidencias/mapa?municipio=16053');
    assert.equal(ajeno.status, 403);
  });

  test('agrupa varias incidencias cercanas en un clúster', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoMapa3');
    for (let i = 1; i <= 3; i += 1) {
      const r = await anon.post(
        '/api/incidencias',
        incidenciaValida({
          titulo: `Bache agrupado ${i}`,
          descripcion: `Reporte repetido para probar el clúster ${i}.`,
          lat: PUNTO_MARAVATIO.lat + i * 0.0008,
          lng: PUNTO_MARAVATIO.lng + i * 0.0008
        })
      );
      assert.equal(r.status, 201, r.body?.error);
    }

    const datos = await anon.get(
      '/api/incidencias/mapa?bbox=-100.5,19.85,-100.35,19.95&cluster=1&celdas=8'
    );
    assert.equal(datos.status, 200);
    assert.ok(datos.body.puntos.some((p) => p.cluster === true && p.total > 1));
  });
});
