/** Pruebas del generador de publicidad para redes sociales. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararEntorno, prepararBaseDeDatos } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
let admin;

before(() => {
  app = crearApp();
});

after(async () => {
  await entorno.limpiar();
});

describe('Publicidad en redes', () => {
  test('el admin genera una publicación con límites, enlaces y QR', async () => {
    admin = await Api.admin(app);
    const plantillas = await admin.get('/api/admin/publicidad/plantillas');
    assert.equal(plantillas.status, 200);
    assert.ok(plantillas.body.redes.some((r) => r.clave === 'facebook'));
    assert.ok(plantillas.body.plantillas.some((p) => p.clave === 'reportar'));

    const generada = await admin.post('/api/admin/publicidad/generar', {
      red: 'x',
      plantilla: 'reportar',
      municipioId: MUNICIPIO_MARAVATIO,
      titulo: 'Reporta los baches',
      texto: 'Texto de prueba para la red social.'
    });
    assert.equal(generada.status, 201, JSON.stringify(generada.body));
    assert.equal(generada.body.publicacion.red, 'x');
    assert.ok(generada.body.caracteres <= 280);
    assert.match(generada.body.publicacion.qrUrl, /^data:image\/svg\+xml/);
    assert.match(generada.body.compartir.x, /twitter.com\/intent\/tweet/);
    assert.match(generada.body.compartir.whatsapp, /wa\.me/);
  });

  test('la vista previa sin guardar no crea publicaciones', async () => {
    const antes = await admin.get('/api/admin/publicidad');
    const simulada = await admin.post('/api/admin/publicidad/simular', {
      red: 'facebook',
      plantilla: 'reportar',
      municipioId: MUNICIPIO_MARAVATIO,
      titulo: 'Vista previa de prueba',
      texto: 'Este texto no debe persistir.'
    });
    assert.equal(simulada.status, 200, JSON.stringify(simulada.body));
    assert.equal(simulada.body.simulada, true);
    assert.ok(simulada.body.texto);
    const despues = await admin.get('/api/admin/publicidad');
    assert.equal(despues.body.total, antes.body.total);
  });

  test('edita el diseño y el municipio sin perder el enlace público', async () => {
    const lista = await admin.get('/api/admin/publicidad');
    const id = lista.body.publicaciones[0].id;
    const editada = await admin.patch(`/api/admin/publicidad/${id}`, {
      red: 'instagram',
      plantilla: 'firmas',
      estructura: 'paso_a_paso',
      municipioId: MUNICIPIO_MARAVATIO,
      titulo: 'Título editado',
      texto: 'Contenido editado desde el estudio.',
      cta: 'Firma aquí',
      colorPrimario: '#1d4ed8',
      enlace: 'https://ejemplo.mx/base?origen=antiguo',
      estado: 'borrador'
    });
    assert.equal(editada.status, 200, JSON.stringify(editada.body));
    const publicacion = editada.body.publicacion;
    assert.equal(publicacion.red, 'instagram');
    assert.equal(publicacion.plantilla, 'firmas');
    assert.equal(publicacion.estructura, 'paso_a_paso');
    assert.equal(publicacion.municipioId, MUNICIPIO_MARAVATIO);
    assert.equal(publicacion.estado, 'borrador');
    assert.match(publicacion.enlace, /^https:\/\/ejemplo\.mx\/base\/\?municipio=16050$/);

    // El selector puede dejar la pieza sin municipio; el enlace debe seguirlo.
    const sinMunicipio = await admin.patch(`/api/admin/publicidad/${id}`, {
      municipioId: null
    });
    assert.equal(sinMunicipio.status, 200, JSON.stringify(sinMunicipio.body));
    assert.equal(sinMunicipio.body.publicacion.municipioId, null);
    assert.equal(sinMunicipio.body.publicacion.enlace, 'https://ejemplo.mx/base/');
  });

  test('lista, descarga y elimina la publicación', async () => {
    const lista = await admin.get('/api/admin/publicidad');
    assert.equal(lista.status, 200);
    assert.equal(lista.body.total, 1);
    const id = lista.body.publicaciones[0].id;

    const descarga = await admin.get(`/api/admin/publicidad/${id}/descargar`);
    assert.equal(descarga.status, 200);
    assert.match(descarga.headers['content-type'], /image\/svg\+xml/);
    const svg = descarga.text || Buffer.from(descarga.body || '').toString('utf8');
    assert.match(svg, /Sistema de Incidencias Municipales/);

    const eliminada = await admin.delete(`/api/admin/publicidad/${id}`);
    assert.equal(eliminada.status, 200);
    assert.equal(eliminada.body.eliminada, true);
  });

  test('un ciudadano no puede generar publicaciones', async () => {
    const ciudadano = await Api.ciudadano(app, { correo: `pub-${Date.now()}@ejemplo.mx` });
    const respuesta = await ciudadano.post('/api/admin/publicidad/generar', {
      red: 'facebook',
      plantilla: 'reportar'
    });
    assert.equal(respuesta.status, 403);
  });
});
