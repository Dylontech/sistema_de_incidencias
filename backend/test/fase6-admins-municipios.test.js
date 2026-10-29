/**
 * Fase 6: administradores territoriales y panel por municipio.
 *
 * Cubre la jerarquía nueva: el admin maestro crea administradores de estado o
 * municipio, y cada uno solo ve y gestiona su ámbito. También el resumen por
 * municipio que alimenta los accesos rápidos del panel.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

const MUNICIPIO_OTRO = '16002'; // Aguililla, mismo estado
const MUNICIPIO_CDMX = '09010'; // Álvaro Obregón, otro estado
const ESTADO_MICHOACAN = 'Michoacán';

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

/** Da de alta una cuenta de personal con el admin maestro y devuelve su sesión. */
async function altaYEntrar(admin, datos) {
  const alta = await admin.post('/api/usuarios').send({ password: 'segura1234', ...datos });
  assert.equal(alta.status, 201, JSON.stringify(alta.body));
  const entrada = await request(app)
    .post('/api/auth/admin')
    .send({ username: datos.username, password: 'segura1234' });
  assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
  return {
    api: new Api(app, entrada.body.token),
    usuario: entrada.body.usuario,
    id: alta.body.usuario.id
  };
}

describe('Fase 6: jerarquía de administradores', () => {
  test('el admin maestro crea administradores municipal y estatal', async () => {
    const admin = await Api.admin(app);

    const municipal = await altaYEntrar(admin, {
      username: 'admin_municipal_1',
      nombre: 'María Municipal',
      rol: 'admin_municipal',
      municipios: [MUNICIPIO_MARAVATIO]
    });
    assert.equal(municipal.usuario.rol, 'admin_municipal');
    assert.ok(municipal.usuario.permisos.includes('gestionar_usuarios'));
    assert.equal(municipal.usuario.puedeEscribir, true);

    const estatal = await altaYEntrar(admin, {
      username: 'admin_estatal_1',
      nombre: 'Elena Estatal',
      rol: 'admin_estatal',
      estados: [ESTADO_MICHOACAN]
    });
    assert.equal(estatal.usuario.rol, 'admin_estatal');
    assert.deepEqual(estatal.usuario.estados, [ESTADO_MICHOACAN]);

    // Los administradores territoriales ya no entran por el acceso de funcionario.
    const porFuncionario = await Api.entrarFuncionario(app, {
      username: 'admin_municipal_1',
      password: 'segura1234',
      claveMunicipio: MUNICIPIO_MARAVATIO
    });
    assert.equal(porFuncionario.status, 401);
  });

  test('un administrador municipal no puede crear administradores ni salir de su ámbito', async () => {
    const municipal = (
      await request(app)
        .post('/api/auth/admin')
        .send({ username: 'admin_municipal_1', password: 'segura1234' })
    ).body;
    const api = new Api(app, municipal.token);

    const otroAdmin = await api.post('/api/usuarios').send({
      username: 'admin_intruso',
      nombre: 'Intruso',
      rol: 'admin_municipal',
      municipios: [MUNICIPIO_MARAVATIO],
      password: 'segura1234'
    });
    assert.equal(otroAdmin.status, 403);

    const fuera = await api.post('/api/usuarios').send({
      username: 'funcionario_ajeno',
      nombre: 'Ajeno',
      rol: 'funcionario',
      municipios: [MUNICIPIO_OTRO],
      password: 'segura1234'
    });
    assert.equal(fuera.status, 403);

    const dentro = await api.post('/api/usuarios').send({
      username: 'funcionario_local',
      nombre: 'Funcionario Local',
      rol: 'funcionario',
      municipios: [MUNICIPIO_MARAVATIO],
      password: 'segura1234'
    });
    assert.equal(dentro.status, 201, JSON.stringify(dentro.body));

    // El maestro sí puede crear cuentas en otros municipios para comparar.
    const maestro = await Api.admin(app);
    const lejos = await maestro.post('/api/usuarios').send({
      username: 'funcionario_lejos',
      nombre: 'Funcionario Lejos',
      rol: 'funcionario',
      municipios: [MUNICIPIO_OTRO],
      password: 'segura1234'
    });
    assert.equal(lejos.status, 201);
  });

  test('el resumen por municipio se acota al ámbito y trae los conteos', async () => {
    const municipal = (
      await request(app)
        .post('/api/auth/admin')
        .send({ username: 'admin_municipal_1', password: 'segura1234' })
    ).body;
    const resumen = await new Api(app, municipal.token).get('/api/admin/municipios/resumen');
    assert.equal(resumen.status, 200, JSON.stringify(resumen.body));
    assert.deepEqual(
      resumen.body.municipios.map((m) => m.id),
      [MUNICIPIO_MARAVATIO]
    );
    const fila = resumen.body.municipios[0];
    for (const campo of ['incidenciasAbiertas', 'ticketsAbiertos', 'sugerenciasPendientes', 'personal']) {
      assert.equal(typeof fila[campo], 'number', `falta ${campo}`);
    }
    assert.ok(fila.personal >= 2, 'debe contar al funcionario de la semilla y al local');

    const estatal = (
      await request(app)
        .post('/api/auth/admin')
        .send({ username: 'admin_estatal_1', password: 'segura1234' })
    ).body;
    const resumenEstado = await new Api(app, estatal.token).get('/api/admin/municipios/resumen');
    assert.equal(resumenEstado.status, 200);
    const ids = resumenEstado.body.municipios.map((m) => m.id);
    assert.ok(ids.includes(MUNICIPIO_MARAVATIO));
    assert.ok(ids.includes(MUNICIPIO_OTRO));
    assert.ok(!ids.includes(MUNICIPIO_CDMX));
  });

  test('usuarios e incidencias respetan el municipio del administrador', async () => {
    const municipal = (
      await request(app)
        .post('/api/auth/admin')
        .send({ username: 'admin_municipal_1', password: 'segura1234' })
    ).body;
    const api = new Api(app, municipal.token);

    const lista = await api.get('/api/usuarios?tipo=personal');
    assert.equal(lista.status, 200);
    const nombres = lista.body.usuarios.map((u) => u.username);
    assert.ok(nombres.includes('funcionario'));
    assert.ok(nombres.includes('funcionario_local'));
    assert.ok(!nombres.includes('funcionario_lejos'));

    // Una incidencia ciudadana en Maravatío sí aparece en su panel.
    const vecino = await Api.ciudadano(app);
    const alta = await vecino.post('/api/incidencias', incidenciaValida());
    assert.equal(alta.status, 201, JSON.stringify(alta.body));

    const incidencias = await api.get('/api/incidencias');
    assert.equal(incidencias.status, 200);
    assert.ok(incidencias.body.incidencias.length >= 1);
    assert.ok(
      incidencias.body.incidencias.every((i) => i.municipioId === MUNICIPIO_MARAVATIO)
    );

    const municipios = await api.get('/api/municipios');
    assert.equal(municipios.status, 200);
    assert.deepEqual(
      municipios.body.municipios.map((m) => m.id),
      [MUNICIPIO_MARAVATIO]
    );
  });

  test('los tickets se filtran por el municipio activo del panel', async () => {
    const maestro = await Api.admin(app);
    const municipal = (
      await request(app)
        .post('/api/auth/admin')
        .send({ username: 'admin_municipal_1', password: 'segura1234' })
    ).body;
    const api = new Api(app, municipal.token);

    const vecino = await Api.ciudadano(app);
    const local = await vecino.post('/api/tickets').send({
      asunto: 'No carga el mapa en el celular',
      cuerpo: 'Desde la última actualización el mapa se queda en blanco.',
      municipioId: MUNICIPIO_MARAVATIO
    });
    assert.equal(local.status, 201, JSON.stringify(local.body));

    const ajeno = await maestro.post('/api/tickets').send({
      asunto: 'Problema en otro municipio',
      cuerpo: 'Este ticket es de un municipio que no le toca al admin municipal.',
      municipioId: MUNICIPIO_CDMX
    });
    assert.equal(ajeno.status, 201, JSON.stringify(ajeno.body));

    const todos = await api.get('/api/tickets');
    assert.equal(todos.status, 200);
    const ids = todos.body.tickets.map((t) => t.id);
    assert.ok(ids.includes(local.body.ticket.id));
    assert.ok(!ids.includes(ajeno.body.ticket.id));

    const filtrados = await api.get(`/api/tickets?municipio=${MUNICIPIO_MARAVATIO}`);
    assert.equal(filtrados.status, 200);
    assert.ok(filtrados.body.tickets.every((t) => t.municipioId === MUNICIPIO_MARAVATIO));
  });

  test('al recargar, el municipio sugerido cae dentro del ámbito', async () => {
    const maestro = await Api.admin(app);

    const estatalCdmx = await altaYEntrar(maestro, {
      username: 'admin_estatal_cdmx',
      nombre: 'Elena Cdmx',
      rol: 'admin_estatal',
      estados: ['Ciudad de México']
    });
    const suyo = await estatalCdmx.api.get('/api/auth/me');
    assert.equal(suyo.status, 200);
    assert.equal(suyo.body.municipioActivo.estado, 'Ciudad de México');

    const municipalOtro = await altaYEntrar(maestro, {
      username: 'admin_municipal_otro',
      nombre: 'Mario Otro',
      rol: 'admin_municipal',
      municipios: [MUNICIPIO_OTRO]
    });
    const suMunicipio = await municipalOtro.api.get('/api/auth/me');
    assert.equal(suMunicipio.status, 200);
    assert.equal(suMunicipio.body.municipioActivo.id, MUNICIPIO_OTRO);
  });

  test('las sugerencias se filtran y responden por ámbito', async () => {
    const municipal = (
      await request(app)
        .post('/api/auth/admin')
        .send({ username: 'admin_municipal_1', password: 'segura1234' })
    ).body;
    const api = new Api(app, municipal.token);

    const propia = await request(app).post('/api/publico/sugerencias').send({
      mensaje: 'Mejorar los filtros del mapa municipal.',
      municipioId: MUNICIPIO_MARAVATIO
    });
    assert.equal(propia.status, 201);
    const ajena = await request(app).post('/api/publico/sugerencias').send({
      mensaje: 'Sugerencia de otro municipio para comprobar el alcance.',
      municipioId: MUNICIPIO_CDMX
    });
    assert.equal(ajena.status, 201);

    const lista = await api.get('/api/sugerencias');
    assert.equal(lista.status, 200);
    assert.ok(lista.body.sugerencias.every((s) => s.municipioId === MUNICIPIO_MARAVATIO));
    const deMaravatio = lista.body.sugerencias.find((s) => s.folio === propia.body.folio);
    assert.ok(deMaravatio, 'la sugerencia propia debe aparecer en el listado');

    const maestro = await Api.admin(app);
    const todas = await maestro.get('/api/sugerencias');
    const deCdmx = todas.body.sugerencias.find((s) => s.folio === ajena.body.folio);
    assert.ok(deCdmx, 'el maestro ve la sugerencia de otro estado');

    const filtrada = await api.get(`/api/sugerencias?municipio=${MUNICIPIO_CDMX}`);
    assert.equal(filtrada.status, 200);
    assert.deepEqual(filtrada.body.sugerencias, []);

    const responder = await api
      .post(`/api/sugerencias/${deMaravatio.id}/responder`)
      .send({ respuesta: 'Gracias, lo revisamos esta semana.' });
    assert.equal(responder.status, 200, JSON.stringify(responder.body));

    const fuera = await api
      .post(`/api/sugerencias/${deCdmx.id}/responder`)
      .send({ respuesta: 'No debería poder responder esta.' });
    assert.equal(fuera.status, 403);
  });
});
