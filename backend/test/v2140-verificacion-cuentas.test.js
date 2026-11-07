/**
 * V2.14.0: configuración de verificación y activación de cuentas.
 *
 * Comprueba que el permiso `gestionar_verificacion_cuentas` protege los
 * endpoints, que el método de activación se aplica en caliente y que los
 * tiempos e inactividad salen de la configuración guardada, no solo del .env.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);

const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');
const { congelarCuentasInactivas } = await import('../src/services/cuenta.service.js');

const CLAVES = [
  'cuentas.activacion_ciudadano',
  'cuentas.token_verificacion_horas',
  'cuentas.token_recuperacion_minutos',
  'cuentas.congelar_inactivas',
  'cuentas.dias_inactividad'
];

let app;
let repositorio;
let admin;

before(async () => {
  app = crearApp();
  repositorio = await obtenerRepositorio();
  admin = await Api.admin(app);
});
after(() => entorno.limpiar());

const sufijo = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(`${process.env.JWT_SECRET}:${token}`)
    .digest('hex');
}

async function tokenConocido(usuario, tipo, token) {
  await repositorio.invalidarTokensCuenta(usuario.id, tipo);
  await repositorio.crearTokenCuenta({
    id: `tok_${sufijo()}`,
    usuarioId: usuario.id,
    tipo,
    tokenHash: hashToken(token),
    expiraEn: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    usadoEn: null,
    creadoEn: new Date().toISOString(),
    ipHash: null,
    userAgent: 'prueba'
  });
  return token;
}

async function configurar(cambios) {
  const respuesta = await admin.put('/api/admin/verificacion-cuentas', cambios);
  assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
  return respuesta.body.configuracion;
}

function valores(configuracion) {
  return new Map(configuracion.map((fila) => [fila.clave, fila.valor]));
}

describe('V2.14.0: verificación y activación de cuentas', () => {
  test('solo el permiso de verificación puede leer y guardar la configuración', async () => {
    await configurar({ 'cuentas.activacion_ciudadano': 'automatica' });
    const ciudadano = await Api.ciudadano(app);

    assert.equal(
      (await ciudadano.get('/api/admin/verificacion-cuentas')).status,
      403,
      'un ciudadano no puede leer la configuración'
    );
    assert.equal(
      (await ciudadano.put('/api/admin/verificacion-cuentas', {
        'cuentas.activacion_ciudadano': 'correo'
      })).status,
      403,
      'un ciudadano no puede cambiar la configuración'
    );

    const lectura = await admin.get('/api/admin/verificacion-cuentas');
    assert.equal(lectura.status, 200, JSON.stringify(lectura.body));
    const claves = new Set(lectura.body.configuracion.map((fila) => fila.clave));
    for (const clave of CLAVES) assert.ok(claves.has(clave), `Falta ${clave}`);
  });

  test('la activación automática permite entrar sin confirmar el correo', async () => {
    await configurar({ 'cuentas.activacion_ciudadano': 'automatica' });
    const correo = `automatica-${sufijo()}@ejemplo.mx`;
    const nombre = `Vecino Automático ${sufijo()}`;
    const password = 'segura1234';

    const registro = await Api.registrar(app, { nombre, correo, password });
    assert.equal(registro.status, 201, JSON.stringify(registro.body));
    assert.equal(registro.body.pendienteVerificacion, undefined);
    assert.ok(registro.body.token);
    assert.equal(registro.body.usuario.correoVerificado, true);

    const entrada = await Api.entrarCiudadano(app, { nombre, password });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
  });

  test('la activación por correo bloquea hasta consumir el token', async () => {
    await configurar({ 'cuentas.activacion_ciudadano': 'correo' });
    const correo = `correo-${sufijo()}@ejemplo.mx`;
    const nombre = `Vecino Correo ${sufijo()}`;
    const password = 'segura1234';

    const registro = await Api.registrar(app, { nombre, correo, password });
    assert.equal(registro.status, 201, JSON.stringify(registro.body));
    assert.equal(registro.body.pendienteVerificacion, true);
    assert.equal(registro.body.token, undefined);

    const pendiente = await repositorio.usuarioPorCorreo(correo);
    assert.equal(pendiente.correoVerificado, false);

    const bloqueada = await Api.entrarCiudadano(app, { nombre, password });
    assert.equal(bloqueada.status, 403);
    assert.equal(bloqueada.body.detalles?.[0]?.codigo, 'correo_no_verificado');

    const token = await tokenConocido(pendiente, 'verificar_correo', `verif-${sufijo()}`);
    const verificado = await request(app).post('/api/auth/cuenta/verificar').send({ token });
    assert.equal(verificado.status, 200, JSON.stringify(verificado.body));

    const entrada = await Api.entrarCiudadano(app, { nombre, password });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
  });

  test('guarda tiempos e inactividad y rechaza claves ajenas o valores inválidos', async () => {
    const guardada = await configurar({
      'cuentas.token_verificacion_horas': 2,
      'cuentas.token_recuperacion_minutos': 15,
      'cuentas.congelar_inactivas': false,
      'cuentas.dias_inactividad': 45
    });
    const mapa = valores(guardada);
    assert.equal(mapa.get('cuentas.token_verificacion_horas'), 2);
    assert.equal(mapa.get('cuentas.token_recuperacion_minutos'), 15);
    assert.equal(mapa.get('cuentas.congelar_inactivas'), false);
    assert.equal(mapa.get('cuentas.dias_inactividad'), 45);

    const enumInvalido = await admin.put('/api/admin/verificacion-cuentas', {
      'cuentas.activacion_ciudadano': 'manual'
    });
    assert.equal(enumInvalido.status, 400, JSON.stringify(enumInvalido.body));

    const fueraDeRango = await admin.put('/api/admin/verificacion-cuentas', {
      'cuentas.token_verificacion_horas': 0
    });
    assert.equal(fueraDeRango.status, 400, JSON.stringify(fueraDeRango.body));

    const claveAjena = await admin.put('/api/admin/verificacion-cuentas', {
      'general.sitio_nombre': 'Otro nombre'
    });
    assert.equal(claveAjena.status, 400, JSON.stringify(claveAjena.body));
  });

  test('la congelación por inactividad respeta el interruptor y los días', async () => {
    await configurar({
      'cuentas.activacion_ciudadano': 'automatica',
      'cuentas.congelar_inactivas': false,
      'cuentas.dias_inactividad': 1
    });
    const correo = `inactivo-${sufijo()}@ejemplo.mx`;
    const nombre = `Vecino Inactivo ${sufijo()}`;
    const password = 'segura1234';
    await Api.registrar(app, { nombre, correo, password });
    const cuenta = await repositorio.usuarioPorCorreo(correo);
    await repositorio.actualizarUsuario(cuenta.id, {
      creadoEn: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
    });

    await congelarCuentasInactivas(repositorio);
    assert.equal((await repositorio.usuarioPorId(cuenta.id)).suspendido, false);

    await configurar({ 'cuentas.congelar_inactivas': true });
    await congelarCuentasInactivas(repositorio);
    const congelada = await repositorio.usuarioPorId(cuenta.id);
    assert.equal(congelada.suspendido, true);
    assert.equal(congelada.suspendidoOrigen, 'inactividad');
  });
});
