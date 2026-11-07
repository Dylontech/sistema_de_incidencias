/**
 * Claves de acceso ligadas al alta/edición de una cuenta del personal.
 *
 * El panel pide `generarClave` al crear la cuenta: la clave cubre sus
 * municipios, se consume una vez para activarla y el código se devuelve una
 * sola vez. Al editar no se crean claves: se consultan o se renuevan. El login
 * sigue aceptando la clave geoestadística antigua en `claveMunicipio`.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

const PATRON_CLAVE = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

async function altaFuncionario(admin, extra = {}) {
  return admin.post('/api/usuarios').send({
    username: 'jlopez',
    nombre: 'Juan López',
    rol: 'funcionario',
    municipios: [MUNICIPIO_MARAVATIO],
    password: 'segura1234',
    ...extra
  });
}

describe('Claves de acceso al dar de alta una cuenta', () => {
  test('el alta devuelve una clave de los municipios asignados y sirve para entrar', async () => {
    const admin = await Api.admin(app);
    const alta = await altaFuncionario(admin, { generarClave: true });

    assert.equal(alta.status, 201);
    assert.match(alta.body.clave.codigo, PATRON_CLAVE);
    assert.deepEqual(alta.body.clave.municipios, [MUNICIPIO_MARAVATIO]);
    assert.equal(alta.body.clave.rolSugerido, 'funcionario');

    // La persona entra con usuario, contraseña y la clave que le entregaron.
    const entrada = await Api.entrarFuncionario(app, {
      username: 'jlopez',
      password: 'segura1234',
      claveAcceso: alta.body.clave.codigo
    });
    assert.equal(entrada.status, 200);
    assert.equal(entrada.body.usuario.rol, 'funcionario');
    assert.equal(entrada.body.municipioActivo.id, MUNICIPIO_MARAVATIO);
  });

  test('sin pedir clave no se genera ninguna y la cuenta queda sin acceso', async () => {
    const admin = await Api.admin(app);
    const alta = await altaFuncionario(admin, { username: 'sinclave', nombre: 'Sin Clave' });
    assert.equal(alta.status, 201);
    assert.equal(alta.body.clave, null);

    // La cuenta existe, pero no puede entrar hasta que se le vincule una clave.
    const entrada = await Api.entrarFuncionario(app, {
      username: 'sinclave',
      password: 'segura1234',
      claveMunicipio: MUNICIPIO_MARAVATIO
    });
    assert.equal(entrada.status, 403);
    assert.equal(entrada.body.detalles?.[0]?.codigo, 'clave_no_asignada');
  });

  test('la administración puede vincular una clave a una cuenta sin acceso', async () => {
    const admin = await Api.admin(app);
    const { usuarios } = (await admin.get('/api/usuarios')).body;
    const cuenta = usuarios.find((u) => u.username === 'sinclave');
    const vinculada = await admin
      .post(`/api/usuarios/${cuenta.id}/clave/vincular`)
      .send({ generarClave: true, claveExpiraEn: '2030-12-31' });
    assert.equal(vinculada.status, 201, JSON.stringify(vinculada.body));
    assert.ok(vinculada.body.clave?.codigo);

    const entrada = await Api.entrarFuncionario(app, {
      username: 'sinclave',
      password: 'segura1234',
      claveAcceso: vinculada.body.clave.codigo
    });
    assert.equal(entrada.status, 200);
  });

  test('una clave que no existe no deja entrar antes de activar la cuenta', async () => {
    const admin = await Api.admin(app);
    const alta = await altaFuncionario(admin, {
      username: 'otro_funcionario',
      nombre: 'Otro Funcionario',
      generarClave: true
    });
    assert.equal(alta.status, 201);

    const entrada = await Api.entrarFuncionario(app, {
      username: 'otro_funcionario',
      password: 'segura1234',
      claveAcceso: 'ZZZZ-ZZZZ-ZZZZ'
    });
    assert.equal(entrada.status, 401);
  });
});

describe('Claves de acceso al editar una cuenta', () => {
  test('editar no genera claves: la renovación es la que crea una nueva', async () => {
    const admin = await Api.admin(app);
    const { usuarios } = (await admin.get('/api/usuarios')).body;
    const cuenta = usuarios.find((u) => u.username === 'sinclave');

    const intento = await admin.patch(`/api/usuarios/${cuenta.id}`).send({
      generarClave: true,
      claveUsosMaximos: 3,
      claveExpiraEn: '2030-12-31'
    });
    assert.equal(intento.status, 400);

    const cambio = await admin.post(`/api/usuarios/${cuenta.id}/clave/renovar`).send({
      claveExpiraEn: '2030-12-31'
    });
    assert.equal(cambio.status, 201, JSON.stringify(cambio.body));
    assert.match(cambio.body.clave.codigo, PATRON_CLAVE);
    assert.equal(cambio.body.clave.modo, 'unica');
    assert.equal(cambio.body.clave.usosMaximos, 1);

    const entrada = await Api.entrarFuncionario(app, {
      username: 'sinclave',
      password: 'segura1234',
      claveAcceso: cambio.body.clave.codigo
    });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
  });

  test('la clave renovada aparece en el estado de la cuenta', async () => {
    const admin = await Api.admin(app);
    const { usuarios } = (await admin.get('/api/usuarios')).body;
    const cuenta = usuarios.find((u) => u.username === 'sinclave');
    const estado = await admin.get(`/api/usuarios/${cuenta.id}/clave`);
    assert.equal(estado.status, 200);
    assert.match(estado.body.clave.codigo, PATRON_CLAVE);
    assert.equal(estado.body.clave.modo, 'unica');
    assert.ok(estado.body.cuenta.claveVigenteHasta);
  });
});

describe('Cliente del acceso del personal', () => {
  test('el formulario envía la clave de acceso además de la clave municipal', () => {
    const ruta = new URL('../../frontend/js/services/auth.service.js', import.meta.url);
    const texto = fs.readFileSync(ruta, 'utf8');
    assert.match(texto, /claveAcceso/);
    assert.match(texto, /claveMunicipio/);
  });
});
