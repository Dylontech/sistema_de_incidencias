/**
 * V2.14.1: autoservicio de la cuenta ciudadana.
 *
 * Cubre el cambio de correo con nueva verificación y aviso al correo anterior,
 * y el cambio de contraseña con cierre de sesiones. El personal y la
 * administración quedan fuera de estos endpoints.
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

async function envios() {
  return repositorio.enviosCorreo({ limite: 500 });
}

describe('V2.14.1: autoservicio de la cuenta ciudadana', () => {
  test('el cambio de correo exige contraseña, formato válido y correo libre', async () => {
    const cuenta = await Api.ciudadanoConCuenta(app);
    const nuevo = `nuevo-${sufijo()}@ejemplo.mx`;

    const malaPassword = await cuenta.api.post('/api/cuenta/correo', {
      correo: nuevo,
      password: 'incorrecta'
    });
    assert.equal(malaPassword.status, 401, JSON.stringify(malaPassword.body));

    const invalido = await cuenta.api.post('/api/cuenta/correo', {
      correo: 'no-es-un-correo',
      password: cuenta.password
    });
    assert.equal(invalido.status, 400, JSON.stringify(invalido.body));

    const mismo = await cuenta.api.post('/api/cuenta/correo', {
      correo: cuenta.correo.toUpperCase(),
      password: cuenta.password
    });
    assert.equal(mismo.status, 400, JSON.stringify(mismo.body));

    const otra = await Api.ciudadanoConCuenta(app);
    const ocupado = await cuenta.api.post('/api/cuenta/correo', {
      correo: otra.correo,
      password: cuenta.password
    });
    assert.equal(ocupado.status, 409, JSON.stringify(ocupado.body));
  });

  test('el correo nuevo queda pendiente de verificación y cierra las sesiones', async () => {
    const cuenta = await Api.ciudadanoConCuenta(app);
    const nuevo = `cambio-${sufijo()}@ejemplo.mx`;
    const tokenViejo = await tokenConocido(
      cuenta.usuario,
      'recuperar_password',
      `recupera-${sufijo()}`
    );

    const cambio = await cuenta.api.post('/api/cuenta/correo', {
      correo: nuevo,
      password: cuenta.password
    });
    assert.equal(cambio.status, 200, JSON.stringify(cambio.body));
    assert.equal(cambio.body.correo, nuevo);
    assert.equal(cambio.body.correoAnterior, cuenta.correo);
    assert.equal(cambio.body.pendienteVerificacion, true);

    const actualizada = await repositorio.usuarioPorCorreo(nuevo);
    assert.ok(actualizada);
    assert.equal(actualizada.correoVerificado, false);

    const lista = await envios();
    assert.ok(
      lista.some((e) => e.tipo === 'verificacion_correo_nuevo' && e.para === nuevo),
      'Falta la confirmación al correo nuevo'
    );
    assert.ok(
      lista.some((e) => e.tipo === 'correo_cambiado_aviso' && e.para === cuenta.correo),
      'Falta el aviso al correo anterior'
    );

    const sesionCerrada = await cuenta.api.get('/api/auth/me');
    assert.equal(
      [401, 403].includes(sesionCerrada.status),
      true,
      `la sesión anterior debe quedar bloqueada: ${sesionCerrada.status} ${JSON.stringify(sesionCerrada.body)}`
    );
    const bloqueada = await Api.entrarCiudadano(app, {
      nombre: cuenta.usuario.nombre,
      password: cuenta.password
    });
    assert.equal(bloqueada.status, 403);
    assert.equal(bloqueada.body.detalles?.[0]?.codigo, 'correo_no_verificado');

    // Un enlace de recuperación emitido al correo anterior ya no sirve.
    const recuperacionVieja = await request(app)
      .post('/api/auth/cuenta/restablecer')
      .send({ token: tokenViejo, password: 'otraClave123' });
    assert.equal(recuperacionVieja.status, 400);

    const token = await tokenConocido(actualizada, 'verificar_correo', `verif-${sufijo()}`);
    const verificado = await request(app).post('/api/auth/cuenta/verificar').send({ token });
    assert.equal(verificado.status, 200, JSON.stringify(verificado.body));

    const porNombre = await Api.entrarCiudadano(app, {
      nombre: cuenta.usuario.nombre,
      password: cuenta.password
    });
    assert.equal(porNombre.status, 200, JSON.stringify(porNombre.body));
    const porCorreo = await Api.entrarCiudadano(app, {
      correo: nuevo,
      password: cuenta.password
    });
    assert.equal(porCorreo.status, 200, JSON.stringify(porCorreo.body));

    // El correo anterior queda libre para un registro nuevo.
    const reutilizado = await Api.registrar(app, {
      nombre: `Nueva ${sufijo()}`,
      correo: cuenta.correo,
      password: 'segura1234'
    });
    assert.equal(reutilizado.status, 201, JSON.stringify(reutilizado.body));
  });

  test('el cambio de contraseña exige la actual, valida la nueva y cierra sesiones', async () => {
    const cuenta = await Api.ciudadanoConCuenta(app);
    const nueva = 'nuevaClave123';

    const malaActual = await cuenta.api.post('/api/cuenta/password', {
      passwordActual: 'incorrecta',
      passwordNueva: nueva
    });
    assert.equal(malaActual.status, 401, JSON.stringify(malaActual.body));

    const corta = await cuenta.api.post('/api/cuenta/password', {
      passwordActual: cuenta.password,
      passwordNueva: 'corta'
    });
    assert.equal(corta.status, 400, JSON.stringify(corta.body));

    const igual = await cuenta.api.post('/api/cuenta/password', {
      passwordActual: cuenta.password,
      passwordNueva: cuenta.password
    });
    assert.equal(igual.status, 400, JSON.stringify(igual.body));

    const cambio = await cuenta.api.post('/api/cuenta/password', {
      passwordActual: cuenta.password,
      passwordNueva: nueva
    });
    assert.equal(cambio.status, 200, JSON.stringify(cambio.body));
    assert.equal(cambio.body.reingresar, true);

    assert.equal(
      (await cuenta.api.get('/api/auth/me')).status,
      401,
      'la sesión anterior debe quedar cerrada'
    );

    const anterior = await Api.entrarCiudadano(app, {
      nombre: cuenta.usuario.nombre,
      password: cuenta.password
    });
    assert.equal(anterior.status, 401, JSON.stringify(anterior.body));

    const actual = await Api.entrarCiudadano(app, {
      nombre: cuenta.usuario.nombre,
      password: nueva
    });
    assert.equal(actual.status, 200, JSON.stringify(actual.body));
  });

  test('el personal y la administración no usan el autoservicio ciudadano', async () => {
    const funcionario = await Api.funcionario(app);
    const admin = await Api.admin(app);

    const cambioFuncionario = await funcionario.post('/api/cuenta/password', {
      passwordActual: 'func123',
      passwordNueva: 'otraClave123'
    });
    assert.equal(cambioFuncionario.status, 403, JSON.stringify(cambioFuncionario.body));

    const correoAdmin = await admin.post('/api/cuenta/correo', {
      correo: `admin-${sufijo()}@ejemplo.mx`,
      password: 'admin123'
    });
    assert.equal(correoAdmin.status, 403, JSON.stringify(correoAdmin.body));
  });
});
