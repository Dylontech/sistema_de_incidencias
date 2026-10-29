/** Informes del personal: CSV/PDF en servidor y respeto del alcance. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const informesService = await import('../src/services/informes.service.js');

let app;
before(async () => {
  app = crearApp();
  const anon = await Api.anonimo(app, 'ciudadanoExporta');
  const r = await anon.post('/api/incidencias', incidenciaValida());
  assert.equal(r.status, 201, r.body?.error);
});
after(() => entorno.limpiar());

describe('Informes del personal', () => {
  test('la selección territorial une estados completos y municipios concretos', () => {
    const catalogo = [
      { id: '1', estado: 'Michoacán' },
      { id: '2', estado: 'Michoacán' },
      { id: '3', estado: 'Guanajuato' },
      { id: '4', estado: 'Guanajuato' }
    ];
    assert.deepEqual(
      informesService
        .unirMunicipiosSeleccionados(catalogo, ['4'], ['Michoacán'])
        .sort(),
      ['1', '2', '4']
    );
  });

  test('el funcionario descarga CSV de su municipio', async () => {
    const funcionario = await Api.funcionario(app);
    const respuesta = await funcionario.get(
      `/api/informes/exportar?formato=csv&municipio=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(respuesta.status, 200);
    assert.match(respuesta.headers['content-type'], /text\/csv/);
    assert.match(respuesta.headers['content-disposition'], /attachment/);
    assert.match(respuesta.text, /Folio interno/);
  });

  test('el funcionario descarga un PDF válido', async () => {
    const funcionario = await Api.funcionario(app);
    const respuesta = await funcionario.get(
      `/api/informes/exportar?formato=pdf&municipio=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(respuesta.status, 200);
    assert.match(respuesta.headers['content-type'], /application\/pdf/);
    // Un PDF empieza con la firma %PDF.
    assert.equal(respuesta.body.subarray(0, 4).toString(), '%PDF');
  });

  test('no puede exportar un municipio fuera de su ámbito', async () => {
    const funcionario = await Api.funcionario(app);
    const respuesta = await funcionario.get('/api/informes/exportar?municipio=16053');
    assert.equal(respuesta.status, 403);
  });

  test('un ciudadano no accede a los informes internos', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoExporta2');
    assert.equal((await anon.get('/api/informes/exportar')).status, 403);
  });

  test('el CSS del informe es público y respeta márgenes y pie configurados', async () => {
    const admin = await Api.admin(app);
    const guardado = await admin.put('/api/admin/configuracion', {
      'informes.margen_superior': 22,
      'informes.margen_derecho': 19,
      'informes.margen_inferior': 17,
      'informes.margen_izquierdo': 13,
      'informes.pie_texto': 'Ayuntamiento de Prueba'
    });
    assert.equal(guardado.status, 200);

    const css = await new Api(app).get('/api/informes/estilo.css');
    assert.equal(css.status, 200);
    assert.match(css.headers['content-type'], /text\/css/);
    assert.match(css.text, /margin: 22mm 19mm 17mm 13mm/);
    assert.match(css.text, /Ayuntamiento de Prueba/);
    assert.match(css.text, /counter\(page\)/);
  });

  test('el admin sube un logo y el PDF lo usa sin romper la exportación', async () => {
    const admin = await Api.admin(app);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );
    const subida = await request(app)
      .post('/api/admin/informes/logo')
      .set('Authorization', `Bearer ${admin.token}`)
      .attach('archivo', png, { filename: 'logo.png', contentType: 'image/png' });
    assert.equal(subida.status, 201, JSON.stringify(subida.body));
    assert.match(subida.body.logo.url, /^\/uploads\//);

    const guardado = await admin.put('/api/admin/configuracion', {
      'informes.logo_url': subida.body.logo.url,
      'informes.logo_posicion': 'derecha',
      'informes.logo_ancho': 110
    });
    assert.equal(guardado.status, 200);

    const pdf = await admin.get(`/api/informes/exportar?formato=pdf&municipio=${MUNICIPIO_MARAVATIO}`);
    assert.equal(pdf.status, 200, JSON.stringify(pdf.body));
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  });
});
