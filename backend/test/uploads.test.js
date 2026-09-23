/** Pruebas de carga de evidencia (antes base64, ahora archivos en disco). */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

describe('Evidencia', () => {
  test('sin sesión no se puede subir', async () => {
    const r = await request(app).post('/api/uploads').attach('archivos', PNG, 'foto.png');
    assert.equal(r.status, 401);
  });

  test('sube una imagen, la guarda en disco y devuelve metadatos con URL', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoUpload');

    const r = await anon
      .post('/api/uploads')
      .attach('archivos', PNG, { filename: 'bache.png', contentType: 'image/png' });

    assert.equal(r.status, 201);
    assert.equal(r.body.evidencia.length, 1);
    const ev = r.body.evidencia[0];
    assert.equal(ev.nombre, 'bache.png');
    assert.equal(ev.tipo, 'image/png');
    assert.match(ev.url, /^\/uploads\/.+\.png$/);
    assert.equal(ev.tamano, PNG.length);

    const enDisco = path.join(entorno.uploads, path.basename(ev.url));
    assert.equal(fs.existsSync(enDisco), true);
    assert.equal(fs.readFileSync(enDisco).length, PNG.length);
  });

  test('rechaza tipos de archivo no permitidos', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoUpload2');
    const r = await anon
      .post('/api/uploads')
      .attach('archivos', Buffer.from('#!/bin/sh\nrm -rf /'), {
        filename: 'script.sh',
        contentType: 'text/x-shellscript'
      });

    assert.equal(r.status, 400);
    assert.match(r.body.error, /no permitido/);
  });

  test('la evidencia subida se adjunta a la incidencia y se sirve por URL', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoUpload3');

    const subida = await anon
      .post('/api/uploads')
      .attach('archivos', PNG, { filename: 'fuga.png', contentType: 'image/png' });
    const [ev] = subida.body.evidencia;

    const creada = await anon.post('/api/incidencias', incidenciaValida({ evidencia: [ev] }));
    assert.equal(creada.status, 201);
    assert.equal(creada.body.incidencia.evidencia.length, 1);
    assert.equal(creada.body.incidencia.evidencia[0].url, ev.url);
    // El documento ya no embebe el binario.
    assert.equal(creada.body.incidencia.evidencia[0].data, undefined);

    const servido = await request(app).get(ev.url);
    assert.equal(servido.status, 200);
    assert.equal(servido.headers['content-type'], 'image/png');
  });

  test('rechaza una evidencia con metadatos inválidos', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoUpload4');
    const r = await anon.post(
      '/api/incidencias',
      incidenciaValida({ evidencia: [{ nombre: 'x.png', tipo: 'image/png' }] })
    );
    assert.equal(r.status, 400);
    assert.ok(r.body.detalles.some((d) => String(d.campo).includes('evidencia')));
  });
});
