/**
 * V2.12.0: autoservicio de la cuenta.
 *
 * Cubre el alta con confirmación de correo, la recuperación de contraseña, la
 * congelación temporal, la eliminación definitiva y la congelación automática
 * de cuentas ciudadanas inactivas durante 30 días.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

// La verificación de correo se prueba a propósito en este archivo.
process.env.VERIFICAR_CORREO_EN_PRUEBAS = 'true';
const entorno = prepararEntorno();
// El job de inactividad también se activa solo aquí.
process.env.CUENTAS_CONGELAR_INACTIVAS = 'true';
process.env.CUENTAS_DIAS_INACTIVIDAD = '30';
await prepararBaseDeDatos(entorno);

const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');
const { congelarCuentasInactivas } = await import('../src/services/cuenta.service.js');

let app;
let repositorio;

before(async () => {
  app = crearApp();
  repositorio = await obtenerRepositorio();
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

async function ciudadanoVerificado(nombre = `Vecina ${sufijo()}`) {
  const correo = `cuenta-${sufijo()}@ejemplo.mx`;
  const password = 'segura1234';
  const registro = await Api.registrar(app, { nombre, correo, password });
  assert.equal(registro.status, 201, JSON.stringify(registro.body));
  assert.equal(registro.body.pendienteVerificacion, true);

  const usuario = await repositorio.usuarioPorCorreo(correo);
  assert.ok(usuario);
  const token = await tokenConocido(usuario, 'verificar_correo', `verif-${sufijo()}`);
  const verificado = await request(app)
    .post('/api/auth/cuenta/verificar')
    .send({ token });
  assert.equal(verificado.status, 200, JSON.stringify(verificado.body));

  const entrada = await Api.entrarCiudadano(app, { nombre, password });
  assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
  const api = new Api(app, entrada.body.token);
  // La primera petición registra la sesión; así la recuperación puede cerrarla.
  assert.equal((await api.get('/api/auth/me')).status, 200);
  return {
    usuario: await repositorio.usuarioPorId(usuario.id),
    api,
    correo,
    nombre,
    password
  };
}

describe('V2.12.0: alta y recuperación de cuenta', () => {
  test('el alta queda pendiente hasta confirmar el correo y luego permite entrar', async () => {
    const correo = `verifica-${sufijo()}@ejemplo.mx`;
    const nombre = `Vecino Verificación ${sufijo()}`;
    const password = 'segura1234';

    const registro = await Api.registrar(app, { nombre, correo, password });
    assert.equal(registro.status, 201, JSON.stringify(registro.body));
    assert.equal(registro.body.pendienteVerificacion, true);
    assert.equal(registro.body.token, undefined);

    const pendiente = await repositorio.usuarioPorCorreo(correo);
    assert.equal(pendiente.correoVerificado, false);

    const loginPendiente = await Api.entrarCiudadano(app, { nombre, password });
    assert.equal(loginPendiente.status, 403);
    assert.equal(loginPendiente.body.detalles?.[0]?.codigo, 'correo_no_verificado');

    const token = await tokenConocido(pendiente, 'verificar_correo', `verif-${sufijo()}`);
    const validado = await request(app)
      .post('/api/auth/cuenta/validar-token')
      .send({ token });
    assert.equal(validado.status, 200, JSON.stringify(validado.body));
    assert.equal(validado.body.tipo, 'verificar_correo');

    const verificado = await request(app)
      .post('/api/auth/cuenta/verificar')
      .send({ token });
    assert.equal(verificado.status, 200, JSON.stringify(verificado.body));

    const login = await Api.entrarCiudadano(app, { nombre, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));

    const reutilizado = await request(app)
      .post('/api/auth/cuenta/verificar')
      .send({ token });
    assert.equal(reutilizado.status, 400);
  });

  test('la recuperación restablece la contraseña y cierra las sesiones anteriores', async () => {
    const cuenta = await ciudadanoVerificado();
    const token = await tokenConocido(
      cuenta.usuario,
      'recuperar_password',
      `recupera-${sufijo()}`
    );

    const restablecida = await request(app)
      .post('/api/auth/cuenta/restablecer')
      .send({ token, password: 'nuevaClave123' });
    assert.equal(restablecida.status, 200, JSON.stringify(restablecida.body));
    assert.equal(restablecida.body.destino, '/');

    assert.equal((await cuenta.api.get('/api/auth/me')).status, 401);

    const anterior = await Api.entrarCiudadano(app, {
      nombre: cuenta.nombre,
      password: cuenta.password
    });
    assert.equal(anterior.status, 401);

    const nuevo = await Api.entrarCiudadano(app, {
      nombre: cuenta.nombre,
      password: 'nuevaClave123'
    });
    assert.equal(nuevo.status, 200, JSON.stringify(nuevo.body));

    const reutilizado = await request(app)
      .post('/api/auth/cuenta/restablecer')
      .send({ token, password: 'otraClave123' });
    assert.equal(reutilizado.status, 400);
  });

  test('una cuenta legada sin clave acepta la clave geoestadística en el campo único', async () => {
    const entrada = await Api.entrarFuncionario(app, {
      username: 'funcionario',
      password: 'func123',
      claveAcceso: MUNICIPIO_MARAVATIO,
      claveMunicipio: MUNICIPIO_MARAVATIO
    });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
  });

  test('la solicitud de recuperación no revela si el correo existe', async () => {
    const existente = await request(app)
      .post('/api/auth/cuenta/recuperar')
      .send({ correo: 'no-existe-v2120@ejemplo.mx' });
    assert.equal(existente.status, 202);
    assert.deepEqual(existente.body, { ok: true });
  });
});

describe('V2.12.0: congelación, eliminación e inactividad', () => {
  test('el titular congela su cuenta y se cierran sus sesiones', async () => {
    const cuenta = await ciudadanoVerificado();
    const congelada = await cuenta.api.post('/api/cuenta/congelar').send({
      dias: 7,
      password: cuenta.password
    });
    assert.equal(congelada.status, 200, JSON.stringify(congelada.body));
    assert.ok(congelada.body.hasta);
    // La sesión queda cerrada y la cuenta congelada responde 403 al reintentar.
    assert.equal((await cuenta.api.get('/api/auth/me')).status, 403);

    const guardada = await repositorio.usuarioPorId(cuenta.usuario.id);
    assert.equal(guardada.suspendido, true);
    assert.equal(guardada.suspendidoOrigen, 'titular');
  });

  test('la eliminación anonimiza el correo y libera el nombre', async () => {
    const cuenta = await ciudadanoVerificado();
    const eliminada = await cuenta.api.post('/api/cuenta/eliminar').send({
      password: cuenta.password,
      confirmacion: cuenta.nombre
    });
    assert.equal(eliminada.status, 200, JSON.stringify(eliminada.body));

    const guardada = await repositorio.usuarioPorId(cuenta.usuario.id);
    assert.equal(guardada.activo, false);
    assert.equal(guardada.correo, null);
    assert.match(guardada.nombre, /^Cuenta eliminada/);
    assert.equal((await cuenta.api.get('/api/auth/me')).status, 401);
  });

  test('una cuenta sin actividad durante 30 días se congela y se reactiva al entrar', async () => {
    // Se crea y verifica la cuenta sin iniciar sesión, para que no haya
    // actividad reciente que la proteja del job de inactividad.
    const correo = `inactiva-${sufijo()}@ejemplo.mx`;
    const nombre = `Vecino Inactivo ${sufijo()}`;
    const password = 'segura1234';
    const registro = await Api.registrar(app, { nombre, correo, password });
    assert.equal(registro.status, 201, JSON.stringify(registro.body));
    const pendiente = await repositorio.usuarioPorCorreo(correo);
    const token = await tokenConocido(pendiente, 'verificar_correo', `inact-${sufijo()}`);
    assert.equal(
      (await request(app).post('/api/auth/cuenta/verificar').send({ token })).status,
      200
    );
    await repositorio.actualizarUsuario(pendiente.id, {
      creadoEn: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
    });

    const congeladas = await congelarCuentasInactivas(repositorio);
    assert.ok(congeladas >= 1);
    const guardada = await repositorio.usuarioPorId(pendiente.id);
    assert.equal(guardada.suspendido, true);
    assert.equal(guardada.suspendidoOrigen, 'inactividad');

    const entrada = await Api.entrarCiudadano(app, { nombre, password });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
    assert.equal(entrada.body.reactivada, true);

    const reactivada = await repositorio.usuarioPorId(pendiente.id);
    assert.equal(reactivada.suspendido, false);
  });
});
