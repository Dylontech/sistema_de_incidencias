/** V2.9.4: claves por estado, sesiones vinculadas y bitácora de auditoría. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

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

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('V2.9.4: claves que cubren estados', () => {
  test('crea una clave para todo un estado y vincula la sesión', async () => {
    const admin = await Api.admin(app);
    const creada = await admin.post('/api/admin/claves').send({
      nombre: 'Cobertura Michoacán',
      estados: ['Michoacán'],
      rolSugerido: 'funcionario',
      usosMaximos: 10
    });
    assert.equal(creada.status, 201);
    const clave = creada.body.clave;
    assert.deepEqual(clave.estados, ['Michoacán']);
    assert.ok(clave.municipios.length > 1);
    assert.ok(clave.municipios.includes('16050'));

    const entrada = await Api.entrarFuncionario(app, {
      username: 'funcionario',
      password: 'func123',
      claveAcceso: clave.codigo
    });
    assert.equal(entrada.status, 200);
    assert.equal(entrada.body.usuario.claveId, clave.id);

    // El middleware registra la sesión con la clave en la siguiente petición.
    const sesion = new Api(app, entrada.body.token);
    assert.equal((await sesion.get('/api/auth/me')).status, 200);

    const lista = await admin.get('/api/admin/sesiones');
    const propia = lista.body.sesiones.find((s) => s.claveId === clave.id);
    assert.ok(propia, 'la sesión debe quedar vinculada a la clave');
    assert.equal(propia.claveCodigo, clave.codigo);

    const claves = await admin.get('/api/admin/claves');
    const visible = claves.body.claves.find((c) => c.id === clave.id);
    assert.equal(visible.sesionesActivas, 1);
    assert.ok(visible.usuariosVinculados.some((u) => u.username === 'funcionario'));
  });

  test('eliminar una clave cierra sus sesiones y la quita del listado', async () => {
    const admin = await Api.admin(app);
    const creada = await admin.post('/api/admin/claves').send({
      nombre: 'Clave temporal para eliminar',
      estados: ['Michoacán'],
      rolSugerido: 'funcionario'
    });
    assert.equal(creada.status, 201);
    const clave = creada.body.clave;

    const entrada = await Api.entrarFuncionario(app, {
      username: 'funcionario',
      password: 'func123',
      claveAcceso: clave.codigo
    });
    assert.equal(entrada.status, 200);
    const sesion = new Api(app, entrada.body.token);
    assert.equal((await sesion.get('/api/auth/me')).status, 200);

    const eliminada = await admin.delete(`/api/admin/claves/${clave.id}`);
    assert.equal(eliminada.status, 200);
    assert.ok(eliminada.body.sesionesCerradas.length >= 1);

    assert.equal((await sesion.get('/api/auth/me')).status, 401);

    const claves = await admin.get('/api/admin/claves');
    assert.ok(!claves.body.claves.some((c) => c.id === clave.id));
  });
});

describe('V2.9.4: auditoría de acciones', () => {
  test('registra actor, resultado y permisos de la acción', async () => {
    const admin = await Api.admin(app);

    const creada = await admin.post('/api/admin/claves').send({
      nombre: 'Clave para auditar',
      estados: ['Michoacán'],
      rolSugerido: 'funcionario'
    });
    assert.equal(creada.status, 201);

    let registro = null;
    for (let intento = 0; intento < 20 && !registro; intento++) {
      const lista = await admin.get('/api/admin/auditoria?accion=/api/admin/claves&limite=20');
      assert.equal(lista.status, 200);
      registro = lista.body.registros.find(
        (r) =>
          r.accion === 'POST /api/admin/claves' &&
          String(r.detalle || '').includes('Clave para auditar')
      );
      if (!registro) await esperar(50);
    }
    assert.ok(registro, 'debe existir el registro de auditoría');
    assert.equal(registro.username, 'admin');
    assert.equal(registro.estadoHttp, 201);
    assert.equal(registro.entidad, 'claves');
    assert.equal(registro.entidadId, creada.body.clave.id);
    const detalle = JSON.parse(registro.detalle);
    assert.ok(detalle.permisos.includes('gestionar_claves'));
  });

  test('un funcionario no puede consultar la bitácora', async () => {
    const funcionario = await Api.funcionario(app);
    const respuesta = await funcionario.get('/api/admin/auditoria');
    assert.equal(respuesta.status, 403);
  });
});
