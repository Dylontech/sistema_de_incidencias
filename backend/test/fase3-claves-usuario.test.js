/**
 * Claves de acceso ligadas al alta/edición de una cuenta del personal.
 *
 * El panel puede pedir `generarClave` al crear o editar un usuario: la clave
 * cubre los municipios de esa cuenta y el código se devuelve una sola vez para
 * entregarlo a la persona. El login acepta esa clave en `claveAcceso` y sigue
 * aceptando la clave geoestadística antigua en `claveMunicipio`.
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

  test('sin pedir clave no se genera ninguna', async () => {
    const admin = await Api.admin(app);
    const alta = await altaFuncionario(admin, { username: 'sinclave', nombre: 'Sin Clave' });
    assert.equal(alta.status, 201);
    assert.equal(alta.body.clave, null);
  });

  test('la clave nueva convive con la clave geoestadística de la cuenta', async () => {
    const entrada = await Api.entrarFuncionario(app, {
      username: 'sinclave',
      password: 'segura1234',
      claveMunicipio: MUNICIPIO_MARAVATIO
    });
    assert.equal(entrada.status, 200);
  });

  test('una clave que no existe no deja entrar aunque la cuenta sea correcta', async () => {
    const entrada = await Api.entrarFuncionario(app, {
      username: 'jlopez',
      password: 'segura1234',
      claveAcceso: 'ZZZZ-ZZZZ-ZZZZ'
    });
    assert.equal(entrada.status, 401);
  });
});

describe('Claves de acceso al editar una cuenta', () => {
  test('editar puede generar una clave nueva para los municipios actuales', async () => {
    const admin = await Api.admin(app);
    const { usuarios } = (await admin.get('/api/usuarios')).body;
    const cuenta = usuarios.find((u) => u.username === 'sinclave');

    const cambio = await admin.patch(`/api/usuarios/${cuenta.id}`).send({
      generarClave: true,
      claveUsosMaximos: 3,
      claveExpiraEn: '2030-12-31'
    });
    assert.equal(cambio.status, 200);
    assert.match(cambio.body.clave.codigo, PATRON_CLAVE);
    assert.equal(cambio.body.clave.usosMaximos, 3);

    const entrada = await Api.entrarFuncionario(app, {
      username: 'sinclave',
      password: 'segura1234',
      claveAcceso: cambio.body.clave.codigo
    });
    assert.equal(entrada.status, 200);
  });

  test('la clave generada aparece en el listado del panel', async () => {
    const admin = await Api.admin(app);
    const { claves } = (await admin.get('/api/admin/claves')).body;
    assert.ok(claves.some((c) => c.nombre.includes('Sin Clave')));
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
