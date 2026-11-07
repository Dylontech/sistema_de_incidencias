/**
 * V2.11.8: comentarios con imagen.
 *
 * Cubre el 409 de la espera anti-spam con `reintentarEn`, el estado del
 * compositor que devuelve el detalle, la validación previa de adjuntos (sin
 * dejar comentarios a medias) y los contratos de la interfaz (formulario,
 * vista previa y visor interno).
 */
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

const raiz = path.resolve(import.meta.dirname, '..', '..');
const leer = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

async function crearIncidencia(api) {
  const creada = await api.post('/api/incidencias').send(incidenciaValida());
  assert.equal(creada.status, 201, JSON.stringify(creada.body));
  return creada.body.incidencia.id;
}

async function subirImagen(api) {
  return api
    .post('/api/adjuntos/comentario')
    .attach('archivo', PNG, { filename: 'comentario.png', contentType: 'image/png' });
}

describe('V2.11.8: comentarios con imagen', () => {
  test('publica texto e imagen juntos y la imagen se descarga con token', async () => {
    const autora = await Api.ciudadano(app);
    const id = await crearIncidencia(autora);

    const subida = await subirImagen(autora);
    assert.equal(subida.status, 201, subida.body?.error);

    const comentario = await autora.post(`/api/incidencias/${id}/comentarios`).send({
      texto: 'Mensaje con imagen',
      adjuntos: [subida.body.adjunto.id]
    });
    assert.equal(comentario.status, 201, comentario.body?.error);

    const detalle = await autora.get(`/api/incidencias/${id}`);
    assert.equal(detalle.status, 200, detalle.body?.error);
    const ultimo = detalle.body.incidencia.comentarios.at(-1);
    assert.equal(ultimo.texto, 'Mensaje con imagen');
    assert.equal(ultimo.adjuntos.length, 1);
    assert.match(ultimo.adjuntos[0].url, /^\/api\/adjuntos\//);

    const imagen = await request(app).get(`${ultimo.adjuntos[0].url}?token=${autora.token}`);
    assert.equal(imagen.status, 200);
    assert.match(imagen.headers['content-type'], /^image\/png/);
  });

  test('la espera responde 409 con reintentarEn y no publica el comentario', async () => {
    const autora = await Api.ciudadano(app);
    const id = await crearIncidencia(autora);

    const primero = await autora
      .post(`/api/incidencias/${id}/comentarios`)
      .send({ texto: 'Comentario inicial' });
    assert.equal(primero.status, 201, primero.body?.error);

    const subida = await subirImagen(autora);
    assert.equal(subida.status, 201, subida.body?.error);

    const segundo = await autora.post(`/api/incidencias/${id}/comentarios`).send({
      texto: 'Mensaje de prueba con imagen',
      adjuntos: [subida.body.adjunto.id]
    });
    assert.equal(segundo.status, 409, JSON.stringify(segundo.body));
    const clave = (segundo.body.detalles || []).find((d) => d.campo === 'reintentarEn');
    assert.ok(clave, 'El 409 debe incluir reintentarEn');
    assert.ok(Number(clave.mensaje) > 0);

    const detalle = await autora.get(`/api/incidencias/${id}`);
    assert.equal(detalle.body.incidencia.comentarios.length, 1);
  });

  test('el detalle informa si el compositor puede enviar ahora', async () => {
    const autora = await Api.ciudadano(app);
    const id = await crearIncidencia(autora);

    const antes = await autora.get(`/api/incidencias/${id}`);
    assert.equal(antes.status, 200, antes.body?.error);
    assert.equal(antes.body.incidencia.permisos.comentario.puede, true);
    assert.equal(antes.body.incidencia.permisos.comentario.esperaSegundos, 0);

    const comentario = await autora
      .post(`/api/incidencias/${id}/comentarios`)
      .send({ texto: 'Activa la espera' });
    assert.equal(comentario.status, 201, comentario.body?.error);

    const despues = await autora.get(`/api/incidencias/${id}`);
    const estado = despues.body.incidencia.permisos.comentario;
    assert.equal(estado.puede, false);
    assert.equal(estado.codigo, 'espera');
    assert.ok(estado.esperaSegundos > 0);
  });

  test('un adjunto de otra cuenta no crea el comentario', async () => {
    const autora = await Api.ciudadano(app);
    const otra = await Api.ciudadano(app);
    const id = await crearIncidencia(autora);

    const subida = await subirImagen(otra);
    assert.equal(subida.status, 201, subida.body?.error);

    const respuesta = await autora.post(`/api/incidencias/${id}/comentarios`).send({
      texto: 'Intento con adjunto ajeno',
      adjuntos: [subida.body.adjunto.id]
    });
    assert.equal(respuesta.status, 403, JSON.stringify(respuesta.body));

    const detalle = await autora.get(`/api/incidencias/${id}`);
    assert.equal(detalle.body.incidencia.comentarios.length, 0);
  });

  test('el compositor es un formulario con vista previa y visor interno', () => {
    const vista = leer('frontend/js/views/detalle.view.js');
    assert.match(vista, /data-submit="detalle:comentar"/);
    assert.match(vista, /id="comentarioAdjuntoPreview"/);
    assert.match(vista, /data-change="detalle:archivoComentario"/);
    assert.match(vista, /data-action="detalle:quitarAdjunto"/);
    assert.match(vista, /data-action="detalle:verAdjunto"/);
    assert.match(vista, /export function seleccionarAdjuntoComentario/);
    assert.match(vista, /export function quitarAdjuntoComentario/);
    assert.match(vista, /export function archivoComentario/);
    assert.match(vista, /export function limpiarComentario/);
    // La imagen publicada ya no abre una pestaña nueva con el token.
    assert.doesNotMatch(vista, /class="c-adjunto" href=/);

    const controlador = leer('frontend/js/controllers/incidencias.controller.js');
    assert.match(controlador, /'detalle:archivoComentario'/);
    assert.match(controlador, /'detalle:quitarAdjunto'/);
    assert.match(controlador, /'detalle:verAdjunto'/);
    assert.match(controlador, /reintentarEn/);
    assert.match(controlador, /adjuntoComentarioPendiente/);

    const visor = leer('frontend/js/core/visor-adjunto.js');
    assert.match(visor, /export function verAdjunto/);
    assert.match(visor, /modalVisorAdjunto/);

    const sw = leer('frontend/sw.js');
    assert.match(sw, /incidencias-shell-v2\.\d+\.\d+/);
    assert.match(sw, /visor-adjunto\.js/);
  });
});
