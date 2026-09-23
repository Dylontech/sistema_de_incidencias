/** Pruebas de autenticación y autorización. */
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

describe('Autenticación', () => {
  test('el ciudadano entra como anónimo y recibe un token con su userKey', async () => {
    const r = await request(app)
      .post('/api/auth/anonimo')
      .send({ anonId: 'ciudadano0001' });

    assert.equal(r.status, 201);
    assert.ok(r.body.token);
    assert.equal(r.body.usuario.rol, 'anonimo');
    assert.equal(r.body.usuario.userKey, 'anon_ciudadano0001');
    assert.equal(r.body.usuario.esAnonimo, true);
    assert.equal(r.body.anonId, 'ciudadano0001');
    assert.equal(r.body.municipioActivo.id, 'maravatio');
    // La clave del municipio nunca debe salir en la respuesta.
    assert.equal(r.body.municipioActivo.clave, undefined);
  });

  test('un anonId inválido se sustituye por uno nuevo', async () => {
    const r = await request(app).post('/api/auth/anonimo').send({ anonId: 'no' });
    assert.equal(r.status, 201);
    assert.notEqual(r.body.anonId, 'no');
  });

  test('el funcionario entra con usuario, contraseña y clave de municipio', async () => {
    const r = await request(app).post('/api/auth/funcionario').send({
      username: 'funcionario',
      password: 'func123',
      claveMunicipio: 'maravatio-2024' // la clave no distingue mayúsculas
    });

    assert.equal(r.status, 200);
    assert.equal(r.body.usuario.rol, 'funcionario');
    assert.equal(r.body.usuario.municipioId, 'maravatio');
    assert.equal(r.body.municipioActivo.nombre, 'Maravatío');
  });

  test('rechaza contraseña incorrecta y clave de municipio incorrecta', async () => {
    const malaPassword = await request(app).post('/api/auth/funcionario').send({
      username: 'funcionario',
      password: 'incorrecta',
      claveMunicipio: 'MARAVATIO-2024'
    });
    assert.equal(malaPassword.status, 401);
    assert.equal(malaPassword.body.error, 'Credenciales incorrectas');

    const malaClave = await request(app).post('/api/auth/funcionario').send({
      username: 'funcionario',
      password: 'func123',
      claveMunicipio: 'NO-EXISTE'
    });
    assert.equal(malaClave.status, 401);
    assert.equal(malaClave.body.error, 'Clave de municipio incorrecta');

    const sinCampos = await request(app)
      .post('/api/auth/funcionario')
      .send({ username: 'funcionario' });
    assert.equal(sinCampos.status, 400);
    assert.equal(sinCampos.body.error, 'Completa todos los campos');

    // Nota: el caso «funcionario asignado a otro municipio» (403) solo puede
    // probarse cuando exista un segundo municipio; hoy el sistema solo tiene
    // Maravatío, por lo que esa comprobación vive en auth.service.js.
  });

  test('el administrador entra sin municipio forzado y ve la clave de los municipios', async () => {
    const admin = await Api.admin(app);

    const yo = await admin.get('/api/auth/me');
    assert.equal(yo.status, 200);
    assert.equal(yo.body.usuario.rol, 'admin');
    assert.equal(yo.body.usuario.municipioId, null); // ya no se fuerza 'maravatio'

    const municipios = await admin.get('/api/municipios');
    assert.equal(municipios.status, 200);
    assert.equal(municipios.body.municipios.length, 1);
    assert.equal(municipios.body.municipios[0].id, 'maravatio');
    assert.equal(municipios.body.municipios[0].clave, 'MARAVATIO-2024');
    // El límite municipal es un polígono real, ya no un rectángulo `bbox`.
    assert.ok(municipios.body.municipios[0].poligono.length >= 3);
    assert.equal(municipios.body.municipios[0].bbox, undefined);
  });

  test('el funcionario no recibe las claves de acceso de otros municipios', async () => {
    const funcionario = await Api.funcionario(app);
    const municipios = await funcionario.get('/api/municipios');
    assert.equal(municipios.status, 200);
    assert.equal(municipios.body.municipios[0].clave, undefined);
  });

  test('sin token no se accede a los recursos protegidos', async () => {
    const sinToken = await request(app).get('/api/incidencias');
    assert.equal(sinToken.status, 401);

    const tokenFalso = await request(app)
      .get('/api/incidencias')
      .set('Authorization', 'Bearer token.invalido.xxx');
    assert.equal(tokenFalso.status, 401);
  });

  test('cambio de municipio activo: exige la clave correcta y devuelve token nuevo', async () => {
    const admin = await Api.admin(app);

    const inexistente = await admin.post('/api/auth/municipio-activo', {
      municipioId: 'no-existe',
      clave: 'X'
    });
    assert.equal(inexistente.status, 404);

    const claveMala = await admin.post('/api/auth/municipio-activo', {
      municipioId: 'maravatio',
      clave: 'NO-ES'
    });
    assert.equal(claveMala.status, 400);
    assert.equal(claveMala.body.error, 'Clave incorrecta');

    const ok = await admin.post('/api/auth/municipio-activo', {
      municipioId: 'maravatio',
      clave: 'MARAVATIO-2024'
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.usuario.municipioId, 'maravatio');
    assert.equal(ok.body.municipioActivo.nombre, 'Maravatío');

    const nuevo = new Api(app, ok.body.token);
    const yo = await nuevo.get('/api/auth/me');
    assert.equal(yo.body.usuario.municipioId, 'maravatio');
  });

  test('un ciudadano anónimo no puede cambiar de municipio', async () => {
    const anon = await Api.anonimo(app, 'ciudadano0002');
    const r = await anon.post('/api/auth/municipio-activo', {
      municipioId: 'maravatio',
      clave: 'MARAVATIO-2024'
    });
    assert.equal(r.status, 403);
  });
});
