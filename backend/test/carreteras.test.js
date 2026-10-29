/**
 * Reportes en carreteras estatales/federales, autopistas y caminos.
 * El punto puede caer fuera del polígono municipal, pero exige municipio de
 * referencia y nombre de la vía.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, PUNTO_FUERA, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

describe('Incidencias en carreteras', () => {
  test('acepta un punto fuera del polígono si es una vía con municipio de referencia', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoCarretera1');
    const creada = await anon.post(
      '/api/incidencias',
      incidenciaValida({
        ...PUNTO_FUERA,
        titulo: 'Bache profundo en la carretera federal',
        ambito: 'carretera_federal',
        jurisdiccion: 'federal',
        viaNombre: 'Carretera Federal 43',
        viaClave: 'MEX-43',
        kilometro: 42.5,
        sentido: 'hacia Morelia',
        tramo: 'km 40-45',
        dependencia: 'SCT'
      })
    );

    assert.equal(creada.status, 201, creada.body?.error);
    const inc = creada.body.incidencia;
    assert.equal(inc.ambito, 'carretera_federal');
    assert.equal(inc.viaNombre, 'Carretera Federal 43');
    assert.equal(inc.kilometro, 42.5);
    assert.equal(inc.estadoEntidad, 'Michoacán');

    const detalle = await anon.get(`/api/incidencias/${inc.id}`);
    assert.equal(detalle.status, 200);
    assert.equal(detalle.body.incidencia.viaClave, 'MEX-43');
    assert.equal(detalle.body.incidencia.dependencia, 'SCT');
  });

  test('el mismo punto en ámbito urbano se rechaza', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoCarretera2');
    const rechazada = await anon.post(
      '/api/incidencias',
      incidenciaValida({ ...PUNTO_FUERA, titulo: 'Punto urbano fuera del municipio' })
    );
    assert.equal(rechazada.status, 400);
  });

  test('una vía sin nombre no se acepta', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoCarretera3');
    const rechazada = await anon.post(
      '/api/incidencias',
      incidenciaValida({
        ...PUNTO_FUERA,
        titulo: 'Autopista sin nombre',
        ambito: 'autopista',
        viaNombre: ''
      })
    );
    assert.equal(rechazada.status, 400);
  });

  test('el listado se puede filtrar por ámbito', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoCarretera4');
    const lista = await anon.get('/api/incidencias?ambito=carretera_federal');
    assert.equal(lista.status, 200);
    assert.ok(lista.body.incidencias.every((i) => i.ambito === 'carretera_federal'));
    assert.ok(lista.body.incidencias.some((i) => i.viaNombre === 'Carretera Federal 43'));
  });
});
