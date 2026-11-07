/** Fase 3.5: solicitudes de acceso y aprobación con clave. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

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

describe('Solicitudes de acceso', () => {
  test('se crea, el admin la ve, la aprueba y genera clave', async () => {
    const creada = await request(app).post('/api/publico/solicitudes-acceso').send({
      nombre: 'Laura Méndez',
      correo: `laura-${Date.now().toString(36)}@ejemplo.mx`,
      rolSolicitado: 'funcionario',
      municipios: [MUNICIPIO_MARAVATIO],
      justificacion: 'Enlace de obras públicas del municipio.'
    });
    assert.equal(creada.status, 201);
    assert.match(creada.body.folio, /^ACC-\d{8}-[A-Z0-9]{6}$/);

    const admin = await Api.admin(app);
    const pendientes = await admin.get('/api/admin/solicitudes-acceso');
    assert.equal(pendientes.status, 200);
    const solicitud = pendientes.body.solicitudes.find((s) => s.folio === creada.body.folio);
    assert.ok(solicitud);

    const aprobada = await admin
      .post(`/api/admin/solicitudes-acceso/${solicitud.id}/aprobar`)
      .send({ generarClave: true, claveExpiraEn: '2030-12-31' });
    assert.equal(aprobada.status, 200, JSON.stringify(aprobada.body));
    assert.ok(aprobada.body.usuario?.username);
    assert.match(aprobada.body.clave?.codigo || '', /^[A-Z2-9]{4}-/);

    const usuarios = await admin.get('/api/usuarios');
    assert.ok(
      usuarios.body.usuarios.some((u) => u.username === aprobada.body.usuario.username),
      'la cuenta aprobada debe existir'
    );
  });

  test('no se aprueba una solicitud sin vincular una clave', async () => {
    const creada = await request(app).post('/api/publico/solicitudes-acceso').send({
      nombre: 'Sin Clave',
      correo: `sin-clave-${Date.now().toString(36)}@ejemplo.mx`,
      rolSolicitado: 'funcionario',
      municipios: [MUNICIPIO_MARAVATIO],
      justificacion: 'Solicitud para comprobar la clave obligatoria.'
    });
    assert.equal(creada.status, 201);

    const admin = await Api.admin(app);
    const pendientes = await admin.get('/api/admin/solicitudes-acceso');
    const solicitud = pendientes.body.solicitudes.find((s) => s.folio === creada.body.folio);
    assert.ok(solicitud);

    const sinClave = await admin
      .post(`/api/admin/solicitudes-acceso/${solicitud.id}/aprobar`)
      .send({});
    assert.equal(sinClave.status, 400, JSON.stringify(sinClave.body));
    assert.match(String(sinClave.body.error), /clave/i);

    const conClave = await admin
      .post(`/api/admin/solicitudes-acceso/${solicitud.id}/aprobar`)
      .send({ generarClave: true, claveExpiraEn: '2030-12-31' });
    assert.equal(conClave.status, 200, JSON.stringify(conClave.body));
    assert.ok(conClave.body.clave?.codigo);
  });

  test('la solicitud admite documentos de respaldo', async () => {
    const subida = await request(app)
      .post('/api/publico/solicitudes-acceso/documentos')
      .attach('documentos', PNG, { filename: 'nombramiento.png', contentType: 'image/png' });
    assert.equal(subida.status, 201, JSON.stringify(subida.body));
    const documento = subida.body.documentos[0];
    assert.match(documento.url, /^\/api\/adjuntos\//);

    const creada = await request(app).post('/api/publico/solicitudes-acceso').send({
      nombre: 'Documentos Prueba',
      correo: `docs-${Date.now().toString(36)}@ejemplo.mx`,
      rolSolicitado: 'funcionario',
      municipios: [MUNICIPIO_MARAVATIO],
      justificacion: 'Adjunto el nombramiento.',
      documentos: [documento.id]
    });
    assert.equal(creada.status, 201, JSON.stringify(creada.body));

    const admin = await Api.admin(app);
    const lista = await admin.get('/api/admin/solicitudes-acceso');
    const solicitud = lista.body.solicitudes.find((s) => s.folio === creada.body.folio);
    assert.equal(solicitud.documentos.length, 1);
    assert.equal(solicitud.documentos[0].nombre, 'nombramiento.png');

    const descarga = await admin.get(documento.url);
    assert.equal(descarga.status, 200);
  });

  test('no se admiten dos solicitudes abiertas del mismo correo', async () => {
    const correo = `dup-${Date.now().toString(36)}@ejemplo.mx`;
    const cuerpo = {
      nombre: 'Duplicado Prueba',
      correo,
      rolSolicitado: 'auditor',
      municipios: [MUNICIPIO_MARAVATIO]
    };
    const primera = await request(app).post('/api/publico/solicitudes-acceso').send(cuerpo);
    assert.equal(primera.status, 201);
    const segunda = await request(app).post('/api/publico/solicitudes-acceso').send(cuerpo);
    assert.equal(segunda.status, 409);
  });

  test('solo un administrador revisa las solicitudes', async () => {
    const funcionario = await Api.funcionario(app);
    const respuesta = await funcionario.get('/api/admin/solicitudes-acceso');
    assert.equal(respuesta.status, 403);
  });
});
