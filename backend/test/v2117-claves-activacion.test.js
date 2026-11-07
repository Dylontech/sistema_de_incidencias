/**
 * V2.11.7: clave de activación por cuenta.
 *
 * La clave se genera al crear la cuenta, se consume una sola vez para
 * activarla y no se vuelve a pedir hasta que vence o se renueva. La edición
 * no puede generar claves nuevas.
 */
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

const sufijo = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function crearCuentaConClave(admin, datos = {}) {
  const respuesta = await admin.post('/api/usuarios').send({
    username: `activacion_${sufijo()}`,
    nombre: 'Cuenta de activación',
    rol: 'funcionario',
    municipios: [MUNICIPIO_MARAVATIO],
    password: 'segura1234',
    generarClave: true,
    claveExpiraEn: '2027-12-31',
    ...datos
  });
  assert.equal(respuesta.status, 201, JSON.stringify(respuesta.body));
  assert.ok(respuesta.body.clave?.codigo, JSON.stringify(respuesta.body));
  return { usuario: respuesta.body.usuario, clave: respuesta.body.clave };
}

describe('V2.11.7: activación con clave por cuenta', () => {
  test('la clave se pide solo hasta activar y no se puede reutilizar en otra cuenta', async () => {
    const admin = await Api.admin(app);
    const primera = await crearCuentaConClave(admin);
    const segunda = await crearCuentaConClave(admin);

    const sinClave = await Api.entrarFuncionario(app, {
      username: primera.usuario.username,
      password: 'segura1234'
    });
    assert.equal(sinClave.status, 400, JSON.stringify(sinClave.body));
    assert.equal(sinClave.body.detalles?.[0]?.codigo, 'clave_requerida');

    const conClave = await Api.entrarFuncionario(app, {
      username: primera.usuario.username,
      password: 'segura1234',
      claveAcceso: primera.clave.codigo
    });
    assert.equal(conClave.status, 200, JSON.stringify(conClave.body));

    // La cuenta ya está activa: no se vuelve a pedir la clave.
    const segundaEntrada = await Api.entrarFuncionario(app, {
      username: primera.usuario.username,
      password: 'segura1234'
    });
    assert.equal(segundaEntrada.status, 200, JSON.stringify(segundaEntrada.body));

    // La clave de la primera cuenta no sirve para la segunda.
    const ajena = await Api.entrarFuncionario(app, {
      username: segunda.usuario.username,
      password: 'segura1234',
      claveAcceso: primera.clave.codigo
    });
    assert.notEqual(ajena.status, 200, JSON.stringify(ajena.body));
  });

  test('editar no crea claves y la renovación exige la nueva', async () => {
    const admin = await Api.admin(app);
    const cuenta = await crearCuentaConClave(admin);

    const activada = await Api.entrarFuncionario(app, {
      username: cuenta.usuario.username,
      password: 'segura1234',
      claveAcceso: cuenta.clave.codigo
    });
    assert.equal(activada.status, 200, JSON.stringify(activada.body));

    const edicion = await admin
      .patch(`/api/usuarios/${cuenta.usuario.id}`)
      .send({ generarClave: true });
    assert.equal(edicion.status, 400, JSON.stringify(edicion.body));

    const estado = await admin.get(`/api/usuarios/${cuenta.usuario.id}/clave`);
    assert.equal(estado.status, 200, JSON.stringify(estado.body));
    assert.equal(estado.body.clave.modo, 'unica');
    assert.ok(estado.body.cuenta.claveVigenteHasta);

    const renovada = await admin
      .post(`/api/usuarios/${cuenta.usuario.id}/clave/renovar`)
      .send({});
    assert.equal(renovada.status, 201, JSON.stringify(renovada.body));
    assert.ok(renovada.body.clave.codigo);
    assert.notEqual(renovada.body.clave.codigo, cuenta.clave.codigo);

    const sinNueva = await Api.entrarFuncionario(app, {
      username: cuenta.usuario.username,
      password: 'segura1234'
    });
    assert.equal(sinNueva.status, 400, JSON.stringify(sinNueva.body));
    assert.equal(sinNueva.body.detalles?.[0]?.codigo, 'clave_requerida');

    const conNueva = await Api.entrarFuncionario(app, {
      username: cuenta.usuario.username,
      password: 'segura1234',
      claveAcceso: renovada.body.clave.codigo
    });
    assert.equal(conNueva.status, 200, JSON.stringify(conNueva.body));
  });
});
