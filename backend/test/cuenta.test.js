/**
 * Pruebas del ciclo de vida de la cuenta: confirmación del correo, recuperación
 * y cambio de contraseña, bloqueo por intentos fallidos, descarga de datos y
 * baja con anonimización.
 *
 * Los correos no salen del proceso: el servicio los deja en una bandeja en
 * memoria y aquí se lee el enlace, que es justo lo que haría el ciudadano.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, incidenciaValida, tokenDelCorreo } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

/** Los correos no se repiten entre ejecuciones sobre la misma base. */
const correoUnico = (base) =>
  `${base}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}@ejemplo.mx`;

const PASSWORD = 'segura1234';

/** Alta cruda: devuelve la respuesta del registro (sin confirmar el correo). */
function registrar(correo, extra = {}) {
  return Api.registrar(app, { correo, password: PASSWORD, nombre: 'Vecina Prueba', ...extra });
}

function entrar(correo, password = PASSWORD) {
  return Api.entrarCiudadano(app, { correo, password });
}

describe('Cuenta: confirmación del correo', () => {
  test('el alta no da sesión y el correo sin confirmar no sirve para entrar', async () => {
    const email = correoUnico('alta');
    const alta = await registrar(email);

    // 201 pero sin token: la cuenta existe, la sesión no.
    assert.equal(alta.status, 201);
    assert.equal(alta.body.requiereVerificacion, true);
    assert.equal(alta.body.token, undefined);

    const temprano = await entrar(email);
    assert.equal(temprano.status, 403);
    assert.match(temprano.body.error, /confirmado tu correo/i);
  });

  test('el enlace del correo confirma la cuenta y entonces sí se entra', async () => {
    const email = correoUnico('confirma');
    await registrar(email);

    const confirmacion = await Api.confirmarCorreo(app, email);
    assert.equal(confirmacion.status, 200);
    assert.equal(confirmacion.body.correo, email);

    const sesion = await entrar(email);
    assert.equal(sesion.status, 200);
    assert.ok(sesion.body.token);
    assert.equal(sesion.body.usuario.correoVerificado, true);
  });

  test('el mismo enlace no vale dos veces', async () => {
    const email = correoUnico('reuso');
    await registrar(email);

    const token = await tokenDelCorreo(email);
    const primera = await request(app).post('/api/auth/verificar').send({ token });
    assert.equal(primera.status, 200);

    // El token se borra al usarlo: repetirlo no dice nada nuevo a quien lo
    // encontró rebuscando en el historial del navegador.
    const segunda = await request(app).post('/api/auth/verificar').send({ token });
    assert.equal(segunda.status, 400);
    assert.match(segunda.body.error, /no es válido o ya se usó/i);
  });

  test('un token inventado no confirma nada', async () => {
    const r = await request(app).post('/api/auth/verificar').send({ token: 'inventado' });
    assert.equal(r.status, 400);
  });

  test('desde la sesión se puede pedir otro enlace de confirmación', async () => {    // Con la confirmación obligatoria no hay sesión sin confirmar, así que el
    // reenvío se prueba con el enlace caducado y un token viejo hecho a mano.
    const email = correoUnico('reenvio');
    await registrar(email);
    const primero = await tokenDelCorreo(email);

    // Se confirma y se entra: a partir de aquí ya está verificado.
    await request(app).post('/api/auth/verificar').send({ token: primero });
    const api = new Api(app, (await entrar(email)).body.token);

    const reenvio = await api.post('/api/cuenta/correo/reenviar');
    assert.equal(reenvio.status, 200);
    assert.equal(reenvio.body.yaVerificado, true);
    assert.equal(reenvio.body.correo, email);
  });

  test('el reenvío sin sesión responde igual exista o no la cuenta', async () => {
    // Sin este camino, quien pierde el enlace no podría confirmar nunca: con la
    // confirmación obligatoria tampoco puede entrar para pedir otro.
    const email = correoUnico('reenvio-publico');
    await registrar(email);
    const primero = await tokenDelCorreo(email);

    const conCuenta = await request(app).post('/api/auth/reenviar').send({ correo: email });
    const sinCuenta = await request(app)
      .post('/api/auth/reenviar')
      .send({ correo: correoUnico('no-existe') });
    assert.equal(conCuenta.status, 200);
    assert.equal(sinCuenta.status, 200);
    assert.deepEqual(sinCuenta.body, conCuenta.body);

    // Y el enlace nuevo sí confirma la cuenta.
    const segundo = await tokenDelCorreo(email);
    assert.notEqual(segundo, primero, 'el reenvío emite un código nuevo');
    const confirmacion = await request(app).post('/api/auth/verificar').send({ token: segundo });
    assert.equal(confirmacion.status, 200);
    assert.equal((await entrar(email)).status, 200);
  });

  test('el correo se puede confirmar por la vía de la recuperación', async () => {
    const email = correoUnico('recupera-confirma');
    await registrar(email);

    const olvide = await request(app).post('/api/auth/olvide').send({ correo: email });
    assert.equal(olvide.status, 200);
    const token = await tokenDelCorreo(email, 'restablecer');

    const restablecer = await request(app)
      .post('/api/auth/restablecer')
      .send({ token, password: 'otraSegura2026' });
    assert.equal(restablecer.status, 200);

    // Quien puede leer el correo es quien lo puso al registrarse: el enlace de
    // recuperación deja la cuenta confirmada y con sesión abierta.
    assert.equal(restablecer.body.usuario.correoVerificado, true);
    const sesion = await entrar(email, 'otraSegura2026');
    assert.equal(sesion.status, 200);
  });
});

describe('Cuenta: contraseñas', () => {
  test('se exige la contraseña actual y una nueva que cumpla la política', async () => {
    const { api } = await Api.ciudadanoConCuenta(app, { correo: correoUnico('pass-politica') });

    const incorrecta = await api.post('/api/cuenta/password', {
      actual: 'noEsLaMia',
      nueva: 'otraSegura2025'
    });
    assert.equal(incorrecta.status, 400);
    assert.match(incorrecta.body.error, /actual no es correcta/i);

    const corta = await api.post('/api/cuenta/password', { actual: PASSWORD, nueva: 'corta' });
    assert.equal(corta.status, 400);
    assert.match(corta.body.detalles[0].mensaje, /al menos 8/i);

    const igual = await api.post('/api/cuenta/password', {
      actual: PASSWORD,
      nueva: PASSWORD
    });
    assert.equal(igual.status, 400);
    assert.match(igual.body.error, /distinta/i);
  });

  test('al cambiarla se cierran las demás sesiones y la actual sigue viva', async () => {
    const email = correoUnico('pass-sesiones');
    const { api } = await Api.ciudadanoConCuenta(app, { correo: email });
    const otra = await entrar(email);
    assert.equal(otra.status, 200);
    const tokenViejo = otra.body.token;

    const cambio = await api.post('/api/cuenta/password', {
      actual: PASSWORD,
      nueva: 'nuevaSegura2026'
    });
    assert.equal(cambio.status, 200);
    assert.ok(cambio.body.token, 'el cambio devuelve un token nuevo para no echar al usuario');

    // La sesión que hizo el cambio sigue funcionando con el token nuevo…
    const conNuevo = new Api(app, cambio.body.token);
    assert.equal((await conNuevo.get('/api/auth/me')).status, 200);

    // …y la otra sesión, abierta con la contraseña anterior, queda fuera.
    const conViejo = new Api(app, tokenViejo);
    const rechazada = await conViejo.get('/api/auth/me');
    assert.equal(rechazada.status, 401);
    assert.match(rechazada.body.error, /caducado/i);

    // El token que se usó para pedir el cambio tampoco vale ya.
    assert.equal((await api.get('/api/auth/me')).status, 401);

    // Y la contraseña vieja ya no entra.
    assert.equal((await entrar(email, PASSWORD)).status, 401);
    assert.equal((await entrar(email, 'nuevaSegura2026')).status, 200);
  });

  test('la recuperación cambia la contraseña y el enlace solo sirve una vez', async () => {
    const email = correoUnico('recuperar');
    await Api.ciudadanoConCuenta(app, { correo: email });

    const olvide = await request(app).post('/api/auth/olvide').send({ correo: email });
    assert.equal(olvide.status, 200);

    const token = await tokenDelCorreo(email, 'restablecer');
    const primera = await request(app)
      .post('/api/auth/restablecer')
      .send({ token, password: 'repuesta2026' });
    assert.equal(primera.status, 200);
    assert.equal((await entrar(email, 'repuesta2026')).status, 200);
    assert.equal((await entrar(email, PASSWORD)).status, 401);

    const segunda = await request(app)
      .post('/api/auth/restablecer')
      .send({ token, password: 'terceraSegura2026' });
    assert.equal(segunda.status, 400);
  });

  test('olvidé mi contraseña responde igual exista o no la cuenta', async () => {
    const email = correoUnico('enumeracion');
    await Api.ciudadanoConCuenta(app, { correo: email });

    const conCuenta = await request(app).post('/api/auth/olvide').send({ correo: email });
    const sinCuenta = await request(app)
      .post('/api/auth/olvide')
      .send({ correo: correoUnico('no-existe') });
    const malEscrito = await request(app).post('/api/auth/olvide').send({ correo: 'sin-arroba' });

    assert.equal(conCuenta.status, 200);
    assert.equal(sinCuenta.status, 200);
    assert.equal(malEscrito.status, 200);
    // Misma respuesta palabra por palabra: la pantalla no puede servir para
    // averiguar qué direcciones están registradas.
    assert.deepEqual(sinCuenta.body, conCuenta.body);
    assert.deepEqual(malEscrito.body, conCuenta.body);
  });

  test('un enlace de recuperación caducado no sirve', async () => {
    const email = correoUnico('caducado');
    const { usuario } = await Api.ciudadanoConCuenta(app, { correo: email });
    await request(app).post('/api/auth/olvide').send({ correo: email });

    // Se adelanta el reloj del token (como si hubieran pasado las 24 horas).
    const repositorio = await (await import('../src/repositories/index.js')).obtenerRepositorio();
    const cuenta = await repositorio.usuarioPorUsername(usuario.username);
    await repositorio.actualizarUsuario(cuenta.id, {
      resetExpira: new Date(Date.now() - 60_000).toISOString()
    });

    const token = await tokenDelCorreo(email, 'restablecer');
    const r = await request(app)
      .post('/api/auth/restablecer')
      .send({ token, password: 'tardeSegura2026' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /caducado/i);
  });
});

describe('Cuenta: bloqueo por intentos fallidos', () => {
  test('tras varios fallos la cuenta se bloquea y avisa del tiempo de espera', async () => {
    const email = correoUnico('bloqueo');
    await Api.ciudadanoConCuenta(app, { correo: email });

    const { config } = await import('../src/config/index.js');
    const tope = config.cuenta.intentosMaximos;

    let ultima;
    for (let i = 0; i < tope; i++) {
      ultima = await entrar(email, 'noEsLaMia');
    }

    // El último intento agota el cupo: 429 con los segundos que faltan.
    assert.equal(ultima.status, 429);
    assert.match(ultima.body.error, /bloqueada/i);
    assert.ok(ultima.body.detalles.reintentarEnSegundos > 0);

    // Y con la contraseña buena tampoco se entra mientras dura el bloqueo: si
    // no, el bloqueo no serviría de nada contra quien ya dio con la contraseña.
    const buena = await entrar(email);
    assert.equal(buena.status, 429);
    assert.match(buena.body.error, /Demasiados intentos/i);
  });

  test('los fallos caducan: al pasar el bloqueo se puede entrar y el contador vuelve a cero', async () => {
    const email = correoUnico('desbloqueo');
    const { usuario } = await Api.ciudadanoConCuenta(app, { correo: email });
    const { config } = await import('../src/config/index.js');
    const repositorio = await (await import('../src/repositories/index.js')).obtenerRepositorio();

    for (let i = 0; i < config.cuenta.intentosMaximos; i++) await entrar(email, 'noEsLaMia');

    // Se adelanta el reloj: el bloqueo ya venció.
    const cuenta = await repositorio.usuarioPorUsername(usuario.username);
    await repositorio.actualizarUsuario(cuenta.id, {
      bloqueadoHasta: new Date(Date.now() - 1000).toISOString()
    });

    const sesion = await entrar(email);
    assert.equal(sesion.status, 200);

    const despues = await repositorio.usuarioPorUsername(usuario.username);
    assert.equal(despues.intentosFallidos, 0);
    assert.equal(despues.bloqueadoHasta, null);
  });

  test('un correo inexistente no bloquea nada ni delata que no existe', async () => {
    const r = await entrar(correoUnico('fantasma'), 'noEsLaMia');
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'Correo o contraseña incorrectos');
  });
});

describe('Cuenta: datos y baja', () => {
  test('la descarga reúne reportes, comentarios, avisos y denuncias', async () => {
    const { api } = await Api.ciudadanoConCuenta(app, { correo: correoUnico('datos') });

    const reporte = await api.post('/api/incidencias', incidenciaValida());
    assert.equal(reporte.status, 201);

    // Un reporte de otra persona donde este ciudadano comenta: el comentario
    // también es suyo y tiene que aparecer en la descarga.
    const ajena = await Api.ciudadano(app, { correo: correoUnico('otra') });
    const suya = await ajena.post('/api/incidencias', incidenciaValida({ titulo: 'Reporte ajeno' }));
    const idAjeno = suya.body.incidencia.id;
    const comentario = await api.post(`/api/incidencias/${idAjeno}/comentarios`, {
      texto: 'Yo vi lo mismo'
    });
    assert.equal(comentario.status, 201);

    // Y una denuncia presentada por él.
    const denuncia = await api.post(`/api/incidencias/${idAjeno}/denuncias`, { motivo: 'spam' });
    assert.equal(denuncia.status, 201);

    const datos = await api.get('/api/cuenta/datos');
    assert.equal(datos.status, 200);
    assert.equal(datos.body.totales.reportes, 1);
    assert.equal(datos.body.totales.comentarios, 1);
    assert.equal(datos.body.totales.denuncias, 1);
    assert.equal(datos.body.reportes[0].titulo, incidenciaValida().titulo);
    assert.equal(datos.body.comentarios[0].incidenciaTitulo, 'Reporte ajeno');
    // Nada de lo que se descarga lleva hashes ni tokens.
    assert.equal(datos.body.cuenta.passwordHash, undefined);
    assert.equal(datos.body.cuenta.tokenVerificacionHash, undefined);
  });

  test('darse de baja anonimiza los reportes, borra los avisos y cierra la cuenta', async () => {
    const email = correoUnico('baja');
    const { api, usuario } = await Api.ciudadanoConCuenta(app, { correo: email });
    const reporte = await api.post('/api/incidencias', incidenciaValida({ titulo: 'Reporte que se queda' }));
    assert.equal(reporte.status, 201);
    const idReporte = reporte.body.incidencia.id;

    const funcionario = await Api.funcionario(app);
    const estado = await funcionario.patch(`/api/incidencias/${idReporte}/estado`, {
      estado: 'en_proceso'
    });
    assert.equal(estado.status, 200);

    const repositorio = await (await import('../src/repositories/index.js')).obtenerRepositorio();
    assert.equal((await repositorio.notificacionesDe(usuario.username)).length > 0, true);

    const baja = await api.delete('/api/cuenta').send({ password: PASSWORD });
    assert.equal(baja.status, 200);
    assert.equal(baja.body.reportes, 1);
    assert.ok(baja.body.avisos >= 1);

    // El reporte sigue publicado (el ayuntamiento conserva el expediente) pero
    // ya sin autor.
    const despues = await funcionario.get(`/api/incidencias/${idReporte}`);
    assert.equal(despues.status, 200);
    const publicada = despues.body.incidencia;
    assert.equal(publicada.esAnonimo, true);
    assert.equal(publicada.autorNombre, 'Anónimo');
    assert.equal(publicada.userKey, 'anonimo');
    // El historial es público: tampoco puede quedar ahí el nombre.
    assert.equal(
      publicada.historial.some((paso) => paso.por === usuario.nombre),
      false
    );

    // La cuenta ya no existe: ni correo, ni avisos, ni entrada.
    assert.equal(await repositorio.usuarioPorUsername(usuario.username), null);
    assert.equal((await repositorio.notificacionesDe(usuario.username)).length, 0);
    assert.equal((await entrar(email)).status, 401);
  });

  test('la baja exige la contraseña y no vale para cuentas del personal', async () => {
    const { api } = await Api.ciudadanoConCuenta(app, { correo: correoUnico('baja-pass') });

    const sinPassword = await api.delete('/api/cuenta').send({ password: 'noEsLaMia' });
    assert.equal(sinPassword.status, 400);
    assert.match(sinPassword.body.error, /no es correcta/i);

    // La cuenta sigue viva tras el intento fallido.
    assert.equal((await api.get('/api/auth/me')).status, 200);

    const admin = await Api.admin(app);
    const intento = await admin.delete('/api/cuenta').send({ password: 'admin123' });
    assert.equal(intento.status, 403);
    assert.match(intento.body.error, /personal/i);
  });

  test('sin sesión no se accede a los datos ni a la baja', async () => {
    assert.equal((await request(app).get('/api/cuenta/datos')).status, 401);
    assert.equal((await request(app).delete('/api/cuenta')).status, 401);
  });
});

describe('Cuenta: sesión revocable', () => {
  test('un token con una versión de sesión que no es la de la cuenta se rechaza', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const { config } = await import('../src/config/index.js');
    const { usuario } = await Api.ciudadanoConCuenta(app, { correo: correoUnico('version') });

    // Firmado con la clave buena (como un token que sobrevivió a un cambio de
    // contraseña) pero con otra versión: el middleware lo corta.
    const desfasado = jwt.sign(
      {
        sub: usuario.username,
        username: usuario.username,
        nombre: usuario.nombre,
        rol: 'ciudadano',
        userKey: usuario.username,
        v: 99
      },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    const r = await new Api(app, desfasado).get('/api/auth/me');
    assert.equal(r.status, 401);
  });

  test('las sesiones anónimas siguen sin pasar por la comprobación de versión', async () => {
    const anonimo = await Api.anonimo(app, 'anonversion01');
    assert.equal((await anonimo.get('/api/auth/me')).status, 200);
  });
});
