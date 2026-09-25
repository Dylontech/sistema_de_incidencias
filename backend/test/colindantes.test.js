/**
 * Pruebas de los municipios colindantes: la vecindad se calcula con la
 * geometría del catálogo, no con una lista escrita a mano.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

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

const nombres = (colindantes) => colindantes.map((c) => c.nombre);

describe('Municipios colindantes', () => {
  test('Maravatío colinda con sus vecinos de Michoacán y de Guanajuato', async () => {
    const anon = await Api.anonimo(app, 'colindantes0001');
    const r = await anon.get('/api/municipios/16050/colindantes');

    assert.equal(r.status, 200);
    const lista = nombres(r.body.colindantes);

    // Los diez municipios que tocan a Maravatío (tres de ellos, de Guanajuato).
    for (const esperado of [
      'Acámbaro',
      'Jerécuaro',
      'Tarandacuao',
      'Contepec',
      'Epitacio Huerta',
      'Hidalgo',
      'Irimbo',
      'Senguio',
      'Tlalpujahua',
      'Zinapécuaro'
    ]) {
      assert.ok(lista.includes(esperado), `falta ${esperado} en ${lista.join(', ')}`);
    }

    assert.equal(r.body.colindantes.length, 10);
    assert.ok(r.body.colindantes.some((c) => c.estado === 'Guanajuato'));
    // No se incluye a sí mismo ni a municipios lejanos.
    assert.ok(!lista.includes('Maravatío'));
    assert.ok(!lista.includes('Morelia'));
  });

  test('encuentra vecinos que apenas se rozan (Cuauhtémoc y Benito Juárez)', async () => {
    // Estas dos alcaldías solo se acercan a un metro y no comparten ni un
    // vértice: una comparación de vértices las perdería.
    const anon = await Api.anonimo(app, 'colindantes0002');
    const r = await anon.get('/api/municipios/09015/colindantes');
    const lista = nombres(r.body.colindantes);

    assert.ok(lista.includes('Benito Juárez'), `sin Benito Juárez en ${lista.join(', ')}`);
    assert.ok(lista.includes('Azcapotzalco'));
    assert.ok(lista.includes('Venustiano Carranza'));
    // Álvaro Obregón está a casi un kilómetro: no colinda.
    assert.ok(!lista.includes('Álvaro Obregón'));
    assert.ok(!lista.includes('Iztapalapa'));
  });

  test('el listado llega ordenado y solo con lo que necesita la interfaz', async () => {
    const anon = await Api.anonimo(app, 'colindantes0003');
    const r = await anon.get('/api/municipios/16053/colindantes');

    assert.equal(r.status, 200);
    const ordenado = nombres(r.body.colindantes);
    assert.deepEqual(ordenado, [...ordenado].sort((a, b) => a.localeCompare(b, 'es')));

    for (const vecino of r.body.colindantes) {
      assert.deepEqual(Object.keys(vecino).sort(), ['estado', 'id', 'nombre']);
    }
    assert.ok(ordenado.includes('Tarímbaro')); // vecino de Morelia
  });

  test('repetir la consulta da el mismo resultado (cálculo memorizado)', async () => {
    const anon = await Api.anonimo(app, 'colindantes0004');
    const primera = await anon.get('/api/municipios/16050/colindantes');
    const segunda = await anon.get('/api/municipios/16050/colindantes');
    assert.deepEqual(segunda.body.colindantes, primera.body.colindantes);
  });

  test('un municipio inexistente responde 404 y sin sesión, 401', async () => {
    const anon = await Api.anonimo(app, 'colindantes0005');
    assert.equal((await anon.get('/api/municipios/999999/colindantes')).status, 404);

    const sinSesion = await request(app).get('/api/municipios/16050/colindantes');
    assert.equal(sinSesion.status, 401);
  });
});
