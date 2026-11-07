/**
 * V2.10: permisos CRUD por cuenta y claves que acotan territorio y permisos.
 *
 * Cubre los dos problemas reportados:
 * - un correo repetido debe responder 409 (no el error crudo de MySQL);
 * - una clave con «ver usuarios» solo permite consultar usuarios del territorio
 *   de la clave, y las acciones crear/editar/eliminar son permisos aparte.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

const MORELIA = '16053';
let app;

before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

const sufijo = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function crearCuenta(admin, datos = {}) {
  return admin.post('/api/usuarios').send({
    username: `personal_${sufijo()}`,
    nombre: 'Personal de prueba',
    rol: 'funcionario',
    municipios: [MUNICIPIO_MARAVATIO],
    password: 'segura1234',
    ...datos
  });
}

async function crearClave(admin, datos = {}) {
  const respuesta = await admin.post('/api/admin/claves').send({
    nombre: `Clave ${sufijo()}`,
    rolSugerido: 'funcionario',
    municipios: [MUNICIPIO_MARAVATIO],
    usosMaximos: 10,
    expiraEn: '2030-12-31',
    ...datos
  });
  assert.equal(respuesta.status, 201, JSON.stringify(respuesta.body));
  return respuesta.body.clave;
}

describe('V2.10: correo único al crear o editar personal', () => {
  test('un correo ya registrado responde 409 con un mensaje entendible', async () => {
    const admin = await Api.admin(app);
    const correo = `repetido-${sufijo()}@ejemplo.mx`;
    const registro = await Api.registrar(app, {
      correo,
      password: 'segura1234',
      nombre: `Ciudadana ${sufijo()}`
    });
    assert.equal(registro.status, 201, JSON.stringify(registro.body));

    const alta = await crearCuenta(admin, { correo });
    assert.equal(alta.status, 409, JSON.stringify(alta.body));
    assert.match(alta.body.error, /correo ya está registrado/i);
    assert.ok(!/Duplicate entry/i.test(alta.body.error));
  });

  test('editar una cuenta tampoco puede robar el correo de otra', async () => {
    const admin = await Api.admin(app);
    const correo = `ocupado-${sufijo()}@ejemplo.mx`;
    const registro = await Api.registrar(app, {
      correo,
      password: 'segura1234',
      nombre: `Ciudadano ${sufijo()}`
    });
    assert.equal(registro.status, 201, JSON.stringify(registro.body));

    const cuenta = await crearCuenta(admin, { correo: `propio-${sufijo()}@ejemplo.mx` });
    assert.equal(cuenta.status, 201, JSON.stringify(cuenta.body));

    const cambio = await admin
      .patch(`/api/usuarios/${cuenta.body.usuario.id}`)
      .send({ correo });
    assert.equal(cambio.status, 409, JSON.stringify(cambio.body));
    assert.match(cambio.body.error, /correo ya está registrado/i);
  });
});

describe('V2.10: la clave define permisos y territorio', () => {
  test('con «ver usuarios» la clave no permite crear cuentas', async () => {
    const admin = await Api.admin(app);
    const clave = await crearClave(admin, { permisos: ['ver_usuarios'] });
    assert.deepEqual(clave.permisos, ['ver_usuarios']);
    const cuenta = await crearCuenta(admin, { claveId: clave.id });
    assert.equal(cuenta.status, 201, JSON.stringify(cuenta.body));

    const entrada = await Api.entrarFuncionario(app, {
      username: cuenta.body.usuario.username,
      password: 'segura1234',
      claveAcceso: clave.codigo
    });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
    assert.ok(entrada.body.usuario.permisos.includes('ver_usuarios'));
    assert.ok(!entrada.body.usuario.permisos.includes('crear_usuarios'));

    const sesion = new Api(app, entrada.body.token);
    const listado = await sesion.get('/api/usuarios');
    assert.equal(listado.status, 200, JSON.stringify(listado.body));

    const alta = await crearCuenta(sesion, {
      username: `no_puede_${sufijo()}`,
      municipios: [MUNICIPIO_MARAVATIO]
    });
    assert.equal(alta.status, 403, JSON.stringify(alta.body));
  });

  test('con «crear usuarios» la clave permite solicitar altas aunque no permita listar', async () => {
    const admin = await Api.admin(app);
    const clave = await crearClave(admin, { permisos: ['crear_usuarios'] });
    const cuenta = await crearCuenta(admin, { claveId: clave.id });
    assert.equal(cuenta.status, 201, JSON.stringify(cuenta.body));

    const entrada = await Api.entrarFuncionario(app, {
      username: cuenta.body.usuario.username,
      password: 'segura1234',
      claveAcceso: clave.codigo
    });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
    assert.ok(entrada.body.usuario.permisos.includes('crear_usuarios'));
    assert.ok(!entrada.body.usuario.permisos.includes('ver_usuarios'));

    const sesion = new Api(app, entrada.body.token);
    assert.equal((await sesion.get('/api/usuarios')).status, 403);

    // V2.11.3: la creación directa ya no está permitida.
    const directa = await crearCuenta(sesion, {
      username: `creado_con_clave_${sufijo()}`,
      municipios: [MUNICIPIO_MARAVATIO]
    });
    assert.equal(directa.status, 403, JSON.stringify(directa.body));

    // El permiso sirve para pedirle el alta a la administración.
    const solicitud = await sesion.post('/api/alta/solicitudes', {
      nombre: 'Alta pedida con clave',
      username: `creado_con_clave_${sufijo()}`
    });
    assert.equal(solicitud.status, 201, JSON.stringify(solicitud.body));
  });

  test('la clave reduce el territorio del listado de usuarios', async () => {
    const admin = await Api.admin(app);
    const usuarioMaravatio = `maravatio_${sufijo()}`;
    const usuarioMorelia = `morelia_${sufijo()}`;
    assert.equal(
      (await crearCuenta(admin, { username: usuarioMaravatio, municipios: [MUNICIPIO_MARAVATIO] }))
        .status,
      201
    );
    assert.equal(
      (await crearCuenta(admin, { username: usuarioMorelia, municipios: [MORELIA] })).status,
      201
    );

    // La cuenta se crea ya ligada a una clave de Maravatío: aunque el panel
    // tenga cuentas de Morelia, la sesión solo ve el territorio de la clave.
    const clave = await crearClave(admin, {
      municipios: [MUNICIPIO_MARAVATIO],
      permisos: ['ver_usuarios']
    });
    const actor = await crearCuenta(admin, {
      username: `amplio_${sufijo()}`,
      municipios: [MUNICIPIO_MARAVATIO],
      claveId: clave.id
    });
    assert.equal(actor.status, 201, JSON.stringify(actor.body));

    const entrada = await Api.entrarFuncionario(app, {
      username: actor.body.usuario.username,
      password: 'segura1234',
      claveAcceso: clave.codigo
    });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
    assert.deepEqual(entrada.body.usuario.municipios, [MUNICIPIO_MARAVATIO]);

    const sesion = new Api(app, entrada.body.token);
    const { usuarios } = (await sesion.get('/api/usuarios')).body;
    const nombres = usuarios.map((u) => u.username);
    assert.ok(nombres.includes(usuarioMaravatio));
    assert.ok(!nombres.includes(usuarioMorelia));

    const municipios = (await sesion.get('/api/municipios')).body.municipios;
    assert.deepEqual(municipios.map((m) => m.id), [MUNICIPIO_MARAVATIO]);
  });
});

describe('V2.10: alta de cuenta desde una clave', () => {
  test('el rol, el territorio y los permisos se toman de la clave', async () => {
    const admin = await Api.admin(app);
    const clave = await crearClave(admin, {
      permisos: ['ver_usuarios'],
      municipios: [MUNICIPIO_MARAVATIO]
    });

    // Una clave de Maravatío no puede crear una cuenta adscrita a Morelia.
    const fuera = await admin.post('/api/usuarios').send({
      username: `fuera_${sufijo()}`,
      nombre: 'Cuenta fuera de la clave',
      rol: 'funcionario',
      password: 'segura1234',
      claveId: clave.id,
      municipios: [MORELIA]
    });
    assert.equal(fuera.status, 403, JSON.stringify(fuera.body));
    assert.equal(fuera.body.detalles?.[0]?.codigo, 'clave_no_corresponde');

    const username = `desde_clave_${sufijo()}`;
    const alta = await admin.post('/api/usuarios').send({
      username,
      nombre: 'Cuenta creada desde clave',
      rol: 'funcionario',
      password: 'segura1234',
      claveId: clave.id,
      // Sin territorio explícito: se toma el de la clave.
      permisos: { reportar: true }
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.body));
    assert.deepEqual(alta.body.usuario.municipios, [MUNICIPIO_MARAVATIO]);
    assert.ok(alta.body.usuario.permisosEfectivos.includes('ver_usuarios'));
    assert.ok(!alta.body.usuario.permisosEfectivos.includes('crear_usuarios'));

    const entrada = await Api.entrarFuncionario(app, {
      username,
      password: 'segura1234',
      claveAcceso: clave.codigo
    });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
    assert.deepEqual(entrada.body.usuario.municipios, [MUNICIPIO_MARAVATIO]);
    assert.deepEqual(entrada.body.usuario.permisos, ['ver_usuarios']);
  });

  test('la baja lógica impide volver a iniciar sesión', async () => {
    const admin = await Api.admin(app);
    const alta = await crearCuenta(admin, {
      username: `baja_${sufijo()}`,
      correo: `baja-${sufijo()}@ejemplo.mx`
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.body));

    const baja = await admin.delete(`/api/usuarios/${alta.body.usuario.id}`);
    assert.equal(baja.status, 200, JSON.stringify(baja.body));
    assert.equal(baja.body.usuario.activo, false);

    const entrada = await Api.entrarFuncionario(app, {
      username: alta.body.usuario.username,
      password: 'segura1234',
      claveMunicipio: MUNICIPIO_MARAVATIO
    });
    assert.equal(entrada.status, 401);
  });
});
