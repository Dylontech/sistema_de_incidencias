/** Pruebas de carga de evidencia (antes base64, ahora archivos en disco). */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, incidenciaValida } from './helpers/api.js';

// Límites diminutos para poder provocarlos con archivos de pocos bytes: subir
// una foto de tamaño real solo haría lenta la prueba sin aportar nada.
process.env.MAX_FOTO_BYTES = '8000';
process.env.MAX_CARGA_BYTES = '12000';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { archivosEnDisco } = await import('../src/services/uploads.service.js');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Un archivo con la firma de PNG y relleno hasta el tamaño pedido.
 *
 * Al servidor le basta con que la firma sea correcta (no descodifica la
 * imagen), así que esto permite provocar los límites de tamaño sin subir una
 * foto de verdad.
 */
function pngDe(bytes) {
  return Buffer.concat([PNG, Buffer.alloc(Math.max(0, bytes - PNG.length))]);
}

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

  test('rechaza los videos: la evidencia es solo de fotografías', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoUploadVideo');
    const r = await anon
      .post('/api/uploads')
      .attach('archivos', Buffer.from('no-es-un-video-real'), {
        filename: 'clip.mp4',
        contentType: 'video/mp4'
      });

    assert.equal(r.status, 400);
    assert.match(r.body.error, /solo se admiten fotografías/i);
  });

  test('tampoco se puede colar el video como metadato de la incidencia', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoUploadVideo2');
    const r = await anon.post(
      '/api/incidencias',
      incidenciaValida({
        evidencia: [{ nombre: 'clip.mp4', tipo: 'video/mp4', tamano: 1024, url: '/uploads/clip.mp4' }]
      })
    );
    assert.equal(r.status, 400);
    assert.ok(r.body.detalles.some((d) => String(d.campo).includes('evidencia')));
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

  test('la evidencia tiene que ser un archivo del propio sistema', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoUploadExterno');
    const r = await anon.post(
      '/api/incidencias',
      incidenciaValida({
        evidencia: [{ nombre: 'ajena.png', tipo: 'image/png', url: 'https://otro-sitio.mx/foto.png' }]
      })
    );
    assert.equal(r.status, 400);
    assert.ok(r.body.detalles.some((d) => String(d.campo).includes('evidencia')));
  });
});

describe('Evidencia: contenido real', () => {
  test('rechaza un SVG aunque se declare como imagen (puede llevar código)', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoSvg');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    const r = await anon
      .post('/api/uploads')
      .attach('archivos', svg, { filename: 'grafico.svg', contentType: 'image/svg+xml' });

    assert.equal(r.status, 400);
    assert.match(r.body.error, /no permitido/i);
  });

  test('rechaza un archivo cuyo contenido no coincide con el tipo declarado', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoFalso');
    const r = await anon.post('/api/uploads').attach('archivos', Buffer.from('#!/bin/sh\necho hola\n'), {
      filename: 'foto.png',
      contentType: 'image/png'
    });

    assert.equal(r.status, 400);
    assert.match(r.body.error, /no es una imagen ni un PDF/i);
  });

  test('rechaza un archivo que pasa del límite por archivo', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoGrande');
    const r = await anon
      .post('/api/uploads')
      .attach('archivos', pngDe(9000), { filename: 'grande.png', contentType: 'image/png' });

    assert.equal(r.status, 413);
    assert.match(r.body.error, /tamaño máximo/i);
  });

  test('rechaza la carga entera si el conjunto pasa del tope, sin dejar archivos', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoLote');
    fs.mkdirSync(entorno.uploads, { recursive: true });
    const antes = fs.readdirSync(entorno.uploads).length;

    const r = await anon
      .post('/api/uploads')
      .attach('archivos', pngDe(6000), { filename: 'a.png', contentType: 'image/png' })
      .attach('archivos', pngDe(6000), { filename: 'b.png', contentType: 'image/png' })
      .attach('archivos', pngDe(6000), { filename: 'c.png', contentType: 'image/png' });

    assert.equal(r.status, 413);
    assert.match(r.body.error, /carga/i);
    // Multer retira lo que ya había escrito: la carpeta no puede crecer.
    assert.equal(fs.readdirSync(entorno.uploads).length, antes);
  });
});

describe('Evidencia: ciclo de vida de los archivos', () => {
  test('al eliminar una incidencia se borran sus archivos', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoBorrado');
    const admin = await Api.admin(app);

    const subida = await anon
      .post('/api/uploads')
      .attach('archivos', PNG, { filename: 'se-va.png', contentType: 'image/png' });
    const [ev] = subida.body.evidencia;

    const creada = await anon.post('/api/incidencias', incidenciaValida({ evidencia: [ev] }));
    assert.equal(creada.status, 201);

    const ruta = path.join(entorno.uploads, path.basename(ev.url));
    assert.equal(fs.existsSync(ruta), true);

    const borrada = await admin.delete(`/api/incidencias/${creada.body.incidencia.id}`);
    assert.equal(borrada.status, 200);
    assert.equal(fs.existsSync(ruta), false);
  });

  test('«Restablecer datos» también retira la evidencia del disco', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoLimpiar');
    const admin = await Api.admin(app);

    const subida = await anon
      .post('/api/uploads')
      .attach('archivos', PNG, { filename: 'se-va-2.png', contentType: 'image/png' });
    const [ev] = subida.body.evidencia;
    await anon.post('/api/incidencias', incidenciaValida({ evidencia: [ev] }));

    const ruta = path.join(entorno.uploads, path.basename(ev.url));
    assert.equal(fs.existsSync(ruta), true);

    const r = await admin.post('/api/admin/limpiar');
    assert.equal(r.status, 200);
    assert.ok(r.body.archivos >= 1);
    assert.equal(fs.existsSync(ruta), false);
  });

  test('el detector de huérfanos encuentra lo que se subió y no se adjuntó', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoHuerfano');
    const subida = await anon
      .post('/api/uploads')
      .attach('archivos', PNG, { filename: 'huerfano.png', contentType: 'image/png' });
    const nombre = path.basename(subida.body.evidencia[0].url);

    const archivos = await archivosEnDisco();
    const encontrado = archivos.find((a) => a.nombre === nombre);
    assert.ok(encontrado, 'el archivo tiene que estar en disco');
    assert.equal(encontrado.tamano, PNG.length);
    assert.ok(encontrado.modificado instanceof Date);
  });
});
