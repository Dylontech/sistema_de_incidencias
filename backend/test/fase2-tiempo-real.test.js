/**
 * Fase 2: tiempo real y preferencias de notificación.
 *
 * El evento se prueba con un servidor HTTP real y `fetch` incremental, porque
 * las respuestas SSE no terminan y supertest esperaría indefinidamente.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO, incidenciaValida } from './helpers/api.js';

const FRONTEND = fileURLToPath(new URL('../../frontend', import.meta.url));
const leer = (relativo) => fs.readFileSync(path.join(FRONTEND, relativo), 'utf8');

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');
const { construirNotificacion } = await import('../src/models/notificacion.model.js');

let app;
let servidor;
let base;

before(async () => {
  app = crearApp();
  servidor = app.listen(0);
  await new Promise((resolver) => servidor.once('listening', resolver));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  servidor.closeAllConnections?.();
  await new Promise((resolver) => servidor.close(resolver));
  entorno.limpiar();
});

/** Lectura con límite: si el servidor no envía nada, falla en vez de colgarse. */
function leerConTiempo(lector, ms = 3000) {
  let temporizador;
  return Promise.race([
    lector.read().finally(() => clearTimeout(temporizador)),
    new Promise((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new Error('timeout de lectura SSE')), ms);
    })
  ]);
}

/** Lee del stream hasta encontrar el evento pedido (o agotar los intentos). */
async function leerEvento(lector, nombre, intentos = 10) {
  const decodificador = new TextDecoder();
  let buffer = '';
  for (let i = 0; i < intentos; i++) {
    const { value, done } = await leerConTiempo(lector);
    if (done) break;
    buffer += decodificador.decode(value, { stream: true });
    if (buffer.includes(`event: ${nombre}`)) return buffer;
  }
  throw new Error(`No llegó el evento "${nombre}": ${buffer}`);
}

describe('Fase 2: SSE de notificaciones', () => {
  test('el funcionario recibe el aviso de una incidencia nueva de su municipio', { timeout: 15000 }, async () => {
    const funcionario = await Api.funcionario(app);
    const controlador = new AbortController();

    const respuesta = await fetch(`${base}/api/eventos`, {
      headers: { Authorization: `Bearer ${funcionario.token}` },
      signal: controlador.signal
    });
    assert.equal(respuesta.status, 200);
    assert.match(respuesta.headers.get('content-type') || '', /text\/event-stream/);

    const lector = respuesta.body.getReader();
    try {
      const ciudadano = await Api.ciudadano(app, {
        correo: `sse-${Date.now().toString(36)}@ejemplo.mx`
      });
      const alta = await ciudadano.post('/api/incidencias').send(incidenciaValida());
      assert.equal(alta.status, 201);

      const texto = await leerEvento(lector, 'notificacion', 20);
      assert.match(texto, /Nueva incidencia/);
      assert.match(texto, /"paraUsuario":"funcionario"/);
      assert.match(texto, new RegExp(`"incidenciaId":"${alta.body.incidencia.id}"`));
    } finally {
      controlador.abort();
    }
  });

  test('sin token el canal responde 401', async () => {
    const respuesta = await fetch(`${base}/api/eventos`);
    assert.equal(respuesta.status, 401);
  });
});

describe('Fase 2: preferencias de notificación', () => {
  test('el funcionario arranca en «asignados» y no puede pedir «todos»', async () => {
    const funcionario = await Api.funcionario(app);

    const consulta = await funcionario.get('/api/notificaciones/preferencias');
    assert.equal(consulta.status, 200);
    assert.equal(consulta.body.preferencias.modo, 'asignados');
    assert.ok(consulta.body.preferencias.permitidos.includes('municipios'));
    assert.ok(!consulta.body.preferencias.permitidos.includes('todos'));

    const intento = await funcionario
      .put('/api/notificaciones/preferencias')
      .send({ modo: 'todos' });
    assert.equal(intento.status, 403);
  });

  test('el funcionario guarda municipios de su ámbito y el admin puede elegir todos', async () => {
    const funcionario = await Api.funcionario(app);
    const guardado = await funcionario.put('/api/notificaciones/preferencias').send({
      modo: 'municipios',
      municipios: [MUNICIPIO_MARAVATIO],
      porCorreo: true
    });
    assert.equal(guardado.status, 200);
    assert.equal(guardado.body.preferencias.modo, 'municipios');
    assert.deepEqual(guardado.body.preferencias.municipios, [MUNICIPIO_MARAVATIO]);
    assert.equal(guardado.body.preferencias.porCorreo, true);

    const admin = await Api.admin(app);
    const consulta = await admin.get('/api/notificaciones/preferencias');
    assert.equal(consulta.status, 200);
    assert.equal(consulta.body.preferencias.modo, 'ninguno');
    assert.ok(consulta.body.preferencias.permitidos.includes('todos'));

    const todos = await admin
      .put('/api/notificaciones/preferencias')
      .send({ modo: 'todos', porCorreo: false });
    assert.equal(todos.status, 200);
    assert.equal(todos.body.preferencias.modo, 'todos');
  });

  test('un municipio fuera del alcance se rechaza', async () => {
    const funcionario = await Api.funcionario(app);
    const repo = await obtenerRepositorio();
    const otro = (await repo.todosMunicipios()).find((m) => m.id !== MUNICIPIO_MARAVATIO);

    const intento = await funcionario.put('/api/notificaciones/preferencias').send({
      modo: 'municipios',
      municipios: [otro.id]
    });
    assert.equal(intento.status, 403);
  });

  test('sin municipios no se puede guardar el modo «municipios»', async () => {
    const admin = await Api.admin(app);
    const intento = await admin
      .put('/api/notificaciones/preferencias')
      .send({ modo: 'municipios', municipios: [] });
    assert.equal(intento.status, 400);
  });

  test('un ciudadano no accede a la configuración', async () => {
    const ciudadano = await Api.ciudadano(app);
    const consulta = await ciudadano.get('/api/notificaciones/preferencias');
    assert.equal(consulta.status, 403);
  });
});

describe('Fase 2: modelos y frontend', () => {
  test('los tipos de notificación nuevos se conservan', () => {
    for (const tipo of ['mensaje', 'contacto', 'sugerencia', 'solicitud']) {
      const notificacion = construirNotificacion({ tipo, titulo: 'x', mensaje: 'y' });
      assert.equal(notificacion.tipo, tipo);
    }
  });

  test('la interfaz tiene campana configurable y cliente SSE', () => {
    const html = leer('index.html');
    assert.match(html, /id="btn-notif-config"/);
    assert.match(html, /id="modalNotifConfig"/);
    assert.ok(fs.existsSync(path.join(FRONTEND, 'js/core/tiempo-real.js')));
    assert.match(leer('js/controllers/notificaciones.controller.js'), /'notificaciones:configurar'/);
    assert.match(leer('js/views/notificaciones.view.js'), /export function renderConfig/);
  });
});
