/** Adjuntos privados de chats y comentarios. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO, incidenciaValida } from './helpers/api.js';

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

async function subir(api, ruta = '/api/adjuntos') {
  return api.post(ruta).attach('archivo', PNG, { filename: 'captura.png', contentType: 'image/png' });
}

describe('Adjuntos privados', () => {
  test('una imagen se sube, solo la ve quien participa y no se sirve desde /uploads', async () => {
    const autora = await Api.ciudadano(app);
    const subida = await subir(autora);
    assert.equal(subida.status, 201, subida.body?.error);
    assert.equal(subida.body.adjunto.tipo, 'image/png');
    assert.match(subida.body.adjunto.url, /^\/api\/adjuntos\//);

    const id = subida.body.adjunto.id;
    assert.equal((await request(app).get(`/api/adjuntos/${id}`)).status, 401);

    const conToken = await request(app).get(`/api/adjuntos/${id}?token=${autora.token}`);
    assert.equal(conToken.status, 200);
    assert.equal(conToken.headers['content-type'], 'image/png');

    const ajena = await Api.ciudadano(app);
    assert.equal((await ajena.get(`/api/adjuntos/${id}`)).status, 404);

    const publica = await request(app).get(`/uploads/adjuntos/${subida.body.adjunto.archivo || 'x.png'}`);
    assert.equal(publica.status, 404);
  });

  test('un comentario puede ser solo una imagen y se devuelve con su adjunto', async () => {
    const autora = await Api.ciudadano(app);
    const alta = await autora.post('/api/incidencias', incidenciaValida({ titulo: 'Bache con foto' }));
    assert.equal(alta.status, 201, alta.body?.error);
    const incidenciaId = alta.body.incidencia.id;

    const subida = await subir(autora, '/api/adjuntos/comentario');
    assert.equal(subida.status, 201, subida.body?.error);

    const comentario = await autora.post(`/api/incidencias/${incidenciaId}/comentarios`, {
      texto: '',
      adjuntos: [subida.body.adjunto.id]
    });
    assert.equal(comentario.status, 201, comentario.body?.error);
    assert.equal(comentario.body.comentario.adjuntos.length, 1);

    const lista = await autora.get(`/api/incidencias/${incidenciaId}/comentarios`);
    assert.equal(lista.status, 200);
    const propio = lista.body.comentarios.find((c) => c.id === comentario.body.comentario.id);
    assert.equal(propio.adjuntos[0].tipo, 'image/png');

    // El detalle de la incidencia es el que pinta la sección de comentarios
    // del modal: debe traer la imagen para que la vista pueda mostrarla.
    const detalle = await autora.get(`/api/incidencias/${incidenciaId}`);
    assert.equal(detalle.status, 200);
    const enDetalle = detalle.body.incidencia.comentarios.find(
      (c) => c.id === comentario.body.comentario.id
    );
    assert.equal(enDetalle.adjuntos[0].tipo, 'image/png');
    assert.match(enDetalle.adjuntos[0].url, /^\/api\/adjuntos\//);
  });

  test('los comentarios no aceptan PDF y las imágenes no se mezclan con chats', async () => {
    const autora = await Api.ciudadano(app);
    const alta = await autora.post('/api/incidencias', incidenciaValida({ titulo: 'Comentario PDF' }));
    const incidenciaId = alta.body.incidencia.id;

    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'latin1');
    const subida = await autora
      .post('/api/adjuntos/comentario')
      .attach('archivo', pdf, { filename: 'documento.pdf', contentType: 'application/pdf' });
    assert.equal(subida.status, 400);

    const chat = await subir(autora);
    const comentario = await autora.post(`/api/incidencias/${incidenciaId}/comentarios`, {
      texto: 'Intento de mezclar canales',
      adjuntos: [chat.body.adjunto.id]
    });
    assert.equal(comentario.status, 400);
  });

  test('el contacto directo admite adjuntos en el mensaje inicial y en las respuestas', async () => {
    const vecina = await Api.ciudadano(app);
    const funcionarios = await vecina.get(
      `/api/contacto/funcionarios?municipioId=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(funcionarios.status, 200, funcionarios.body?.error);
    assert.ok(funcionarios.body.funcionarios.length);

    const subida = await subir(vecina);
    const creado = await vecina.post('/api/contacto/funcionarios', {
      municipioId: MUNICIPIO_MARAVATIO,
      funcionarioIds: [funcionarios.body.funcionarios[0].id],
      asunto: 'Reporte con evidencia',
      mensaje: 'Adjunto la foto del problema.',
      adjuntos: [subida.body.adjunto.id]
    });
    assert.equal(creado.status, 201, creado.body?.error);

    const mios = await vecina.get('/api/contacto/mios');
    assert.equal(mios.status, 200, mios.body?.error);
    assert.ok(mios.body.contactos.some((c) => c.id === creado.body.contacto.id));

    const funcionario = await Api.funcionario(app);
    const detalle = await funcionario.get(`/api/contacto/directo/${creado.body.contacto.id}`);
    assert.equal(detalle.status, 200, detalle.body?.error);
    assert.equal(detalle.body.contacto.adjuntos.length, 1);

    const respuestaAdjunto = await subir(funcionario);
    const respuesta = await funcionario.post(
      `/api/contacto/directo/${creado.body.contacto.id}/mensajes`,
      { cuerpo: 'Recibido, revisamos la imagen.', adjuntos: [respuestaAdjunto.body.adjunto.id] }
    );
    assert.equal(respuesta.status, 201, respuesta.body?.error);
    assert.ok(respuesta.body.contacto.mensajes.some((m) => m.adjuntos.length === 1));
  });

  test('la mensajería interna incluye los adjuntos del mensaje correcto', async () => {
    const admin = await Api.admin(app);
    const subida = await subir(admin);
    const enviado = await admin.post('/api/mensajes', {
      paraUsuario: 'funcionario',
      asunto: 'Expediente adjunto',
      cuerpo: 'Te comparto la captura.',
      adjuntos: [subida.body.adjunto.id]
    });
    assert.equal(enviado.status, 201, enviado.body?.error);

    const funcionario = await Api.funcionario(app);
    const hilo = await funcionario.get(`/api/mensajes/${enviado.body.mensaje.hilo}`);
    assert.equal(hilo.status, 200, hilo.body?.error);
    assert.equal(hilo.body.mensajes.length, 1);
    assert.equal(hilo.body.mensajes[0].adjuntos.length, 1);
  });
});
