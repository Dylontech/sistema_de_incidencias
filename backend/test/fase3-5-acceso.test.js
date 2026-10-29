/** Fase 3.5: solicitudes de acceso y aprobación con clave. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

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

    const aprobada = await admin.post(
      `/api/admin/solicitudes-acceso/${solicitud.id}/aprobar`
    );
    assert.equal(aprobada.status, 200);
    assert.ok(aprobada.body.usuario?.username);
    assert.match(aprobada.body.clave?.codigo || '', /^[A-Z2-9]{4}-/);

    const usuarios = await admin.get('/api/usuarios');
    assert.ok(
      usuarios.body.usuarios.some((u) => u.username === aprobada.body.usuario.username),
      'la cuenta aprobada debe existir'
    );
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
