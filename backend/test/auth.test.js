/** Pruebas de autenticación y autorización. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, CLAVE_MARAVATIO, MUNICIPIO_MARAVATIO } from './helpers/api.js';

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
    assert.equal(r.body.municipioActivo.id, MUNICIPIO_MARAVATIO);
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
      claveMunicipio: CLAVE_MARAVATIO
    });

    assert.equal(r.status, 200);
    assert.equal(r.body.usuario.rol, 'funcionario');
    assert.equal(r.body.usuario.municipioId, MUNICIPIO_MARAVATIO);
    assert.equal(r.body.municipioActivo.nombre, 'Maravatío');
  });

  test('un funcionario no puede entrar con la clave de otro municipio', async () => {
    // Ahora sí se puede probar: el catálogo tiene los 113 municipios del estado.
    const r = await request(app).post('/api/auth/funcionario').send({
      username: 'funcionario',
      password: 'func123',
      claveMunicipio: '16053' // Morelia
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'No tienes acceso a este municipio');
  });

  test('rechaza contraseña incorrecta y clave de municipio incorrecta', async () => {
    const malaPassword = await request(app).post('/api/auth/funcionario').send({
      username: 'funcionario',
      password: 'incorrecta',
      claveMunicipio: CLAVE_MARAVATIO
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
  });

  test('el administrador entra sin municipio forzado y ve la clave de los municipios', async () => {
    const admin = await Api.admin(app);

    const yo = await admin.get('/api/auth/me');
    assert.equal(yo.status, 200);
    assert.equal(yo.body.usuario.rol, 'admin');
    assert.equal(yo.body.usuario.municipioId, null); // ya no se fuerza un municipio

    const municipios = await admin.get('/api/municipios');
    assert.equal(municipios.status, 200);
    // Los 175 municipios de los tres estados, ordenados por estado y nombre y
    // sin los polígonos (el listado ligero no los lleva; el detalle sí).
    assert.equal(municipios.body.municipios.length, 175);
    const estados = [...new Set(municipios.body.municipios.map((m) => m.estado))];
    assert.deepEqual(estados, ['Ciudad de México', 'Guanajuato', 'Michoacán']);
    assert.equal(municipios.body.municipios[0].estado, 'Ciudad de México');
    // En la CDMX el INEGI codifica las alcaldías como municipios.
    assert.ok(
      municipios.body.municipios.some((m) => m.id === '09015' && m.nombre === 'Cuauhtémoc')
    );
    assert.ok(municipios.body.municipios.some((m) => m.id === '11007' && m.nombre === 'Celaya'));

    const maravatio = municipios.body.municipios.find((m) => m.id === MUNICIPIO_MARAVATIO);
    assert.ok(maravatio, 'Maravatío debe estar en el catálogo');
    assert.equal(maravatio.clave, CLAVE_MARAVATIO);
    assert.equal(maravatio.poligono, undefined);
    assert.equal(maravatio.bbox, undefined);

    // El límite municipal (polígono real, ya no un rectángulo) se pide aparte.
    const detalle = await admin.get(`/api/municipios/${MUNICIPIO_MARAVATIO}`);
    assert.equal(detalle.status, 200);
    assert.ok(detalle.body.municipio.poligono.length >= 3);
    assert.ok(Number(detalle.body.municipio.poblacion) > 0);
    assert.equal(detalle.body.municipio.estado, 'Michoacán');

    const inexistente = await admin.get('/api/municipios/99999');
    assert.equal(inexistente.status, 404);
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
      municipioId: MUNICIPIO_MARAVATIO,
      clave: 'NO-ES'
    });
    assert.equal(claveMala.status, 400);
    assert.equal(claveMala.body.error, 'Clave incorrecta');

    const ok = await admin.post('/api/auth/municipio-activo', {
      municipioId: MUNICIPIO_MARAVATIO,
      clave: CLAVE_MARAVATIO
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.usuario.municipioId, MUNICIPIO_MARAVATIO);
    assert.equal(ok.body.municipioActivo.nombre, 'Maravatío');

    const nuevo = new Api(app, ok.body.token);
    const yo = await nuevo.get('/api/auth/me');
    assert.equal(yo.body.usuario.municipioId, MUNICIPIO_MARAVATIO);
  });

  test('un ciudadano anónimo no puede cambiar de municipio', async () => {
    const anon = await Api.anonimo(app, 'ciudadano0002');
    const r = await anon.post('/api/auth/municipio-activo', {
      municipioId: MUNICIPIO_MARAVATIO,
      clave: CLAVE_MARAVATIO
    });
    assert.equal(r.status, 403);
  });
});
