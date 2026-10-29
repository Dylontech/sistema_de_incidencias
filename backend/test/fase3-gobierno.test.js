/** Fase 3: permisos por cuenta, claves de acceso y revocación de sesiones. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

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

describe('Fase 3: permisos por cuenta', () => {
  test('el admin quita «moderar» y la sesión del funcionario lo refleja', async () => {
    const admin = await Api.admin(app);
    const { usuarios } = (await admin.get('/api/usuarios')).body;
    const funcionario = usuarios.find((u) => u.username === 'funcionario');

    const cambio = await admin
      .patch(`/api/usuarios/${funcionario.id}`)
      .send({ permisos: { ...funcionario.permisos, moderar: false } });
    assert.equal(cambio.status, 200);

    const sesion = await Api.funcionario(app);
    const yo = await sesion.get('/api/auth/me');
    assert.equal(yo.status, 200);
    assert.ok(!yo.body.usuario.permisos.includes('moderar'));
  });

  test('un funcionario no puede editar cuentas ni permisos', async () => {
    const funcionario = await Api.funcionario(app);
    const respuesta = await funcionario
      .patch('/api/usuarios/u1')
      .send({ permisos: { moderar: true } });
    assert.equal(respuesta.status, 403);
  });
});

describe('Fase 3: claves de acceso', () => {
  test('una clave multi-municipio permite entrar sin la clave legada', async () => {
    const admin = await Api.admin(app);
    const creada = await admin.post('/api/admin/claves').send({
      nombre: 'Funcionarios de prueba',
      municipios: [MUNICIPIO_MARAVATIO],
      rolSugerido: 'funcionario'
    });
    assert.equal(creada.status, 201);
    assert.match(creada.body.clave.codigo, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const entrada = await Api.entrarFuncionario(app, {
      username: 'funcionario',
      password: 'func123',
      claveAcceso: creada.body.clave.codigo
    });
    assert.equal(entrada.status, 200);
    assert.equal(entrada.body.usuario.rol, 'funcionario');
  });

  test('una clave inválida no permite entrar', async () => {
    const entrada = await Api.entrarFuncionario(app, {
      username: 'funcionario',
      password: 'func123',
      claveAcceso: 'AAAA-BBBB-CCCC'
    });
    assert.equal(entrada.status, 401);
  });

  test('solo quien puede gestionar claves las crea', async () => {
    const funcionario = await Api.funcionario(app);
    const respuesta = await funcionario
      .post('/api/admin/claves')
      .send({ nombre: 'No permitida', municipios: [MUNICIPIO_MARAVATIO] });
    assert.equal(respuesta.status, 403);
  });
});

describe('Fase 3: sesiones y revocación', () => {
  test('el admin ve la sesión del funcionario y puede revocarla', async () => {
    const funcionario = await Api.funcionario(app);
    await funcionario.get('/api/notificaciones');

    const admin = await Api.admin(app);
    const lista = await admin.get('/api/admin/sesiones');
    assert.equal(lista.status, 200);
    const sesion = lista.body.sesiones.find((s) => s.userKey === 'funcionario');
    assert.ok(sesion, 'debe aparecer la sesión del funcionario');
    assert.ok(sesion.ipHash, 'la IP debe guardarse como huella');

    const revocada = await admin.delete(`/api/admin/sesiones/${sesion.id}`);
    assert.equal(revocada.status, 200);

    const despues = await funcionario.get('/api/notificaciones');
    assert.equal(despues.status, 401);
  });

  test('un ciudadano no puede ver el monitoreo de sesiones', async () => {
    const ciudadano = await Api.ciudadano(app);
    const respuesta = await ciudadano.get('/api/admin/sesiones');
    assert.equal(respuesta.status, 403);
  });
});
