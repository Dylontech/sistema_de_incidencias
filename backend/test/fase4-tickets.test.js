/** Fase 4: tickets de soporte y archivos de la PWA. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, incidenciaValida } from './helpers/api.js';

const FRONTEND = fileURLToPath(new URL('../../frontend', import.meta.url));

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

describe('Fase 4: tickets de soporte', () => {
  test('un ciudadano crea un ticket y el admin lo ve y lo cierra', async () => {
    const ciudadano = await Api.ciudadano(app);
    const creado = await ciudadano.post('/api/tickets').send({
      asunto: 'El mapa no carga en mi teléfono',
      categoria: 'error',
      prioridad: 'alta',
      cuerpo: 'Al abrir el mapa se queda en blanco desde la última actualización.'
    });
    assert.equal(creado.status, 201);
    assert.match(creado.body.ticket.folio, /^TCK-\d{8}-[A-Z0-9]{6}$/);
    // El ciudadano no decide la prioridad: «alta» se ignora y nace en media.
    assert.equal(creado.body.ticket.prioridad, 'media');

    const propios = await ciudadano.get('/api/tickets');
    assert.equal(propios.status, 200);
    assert.equal(propios.body.tickets.length, 1);

    const admin = await Api.admin(app);
    const todos = await admin.get('/api/tickets');
    assert.equal(todos.status, 200);
    assert.ok(todos.body.tickets.some((t) => t.id === creado.body.ticket.id));

    const prioridad = await admin
      .patch(`/api/tickets/${creado.body.ticket.id}/prioridad`)
      .send({ prioridad: 'alta' });
    assert.equal(prioridad.status, 200);
    assert.equal(prioridad.body.ticket.prioridad, 'alta');

    const cerrado = await admin
      .patch(`/api/tickets/${creado.body.ticket.id}/estado`)
      .send({ estado: 'cerrado' });
    assert.equal(cerrado.status, 200);
    assert.equal(cerrado.body.ticket.estado, 'cerrado');
  });

  test('una sesión anónima no puede abrir tickets', async () => {
    const anon = await Api.anonimo(app, 'ticketAnonimo');
    const respuesta = await anon.post('/api/tickets').send({
      asunto: 'Prueba anónima',
      cuerpo: 'No debería permitirse.'
    });
    assert.equal(respuesta.status, 403);
  });
});

describe('Fase 4: PWA y modo offline', () => {
  test('reenviar el mismo reporte offline no crea duplicados', async () => {
    const ciudadano = await Api.ciudadano(app);
    const carga = incidenciaValida({ claveIdempotencia: `off-${Date.now()}` });
    const primera = await ciudadano.post('/api/incidencias').send(carga);
    const segunda = await ciudadano.post('/api/incidencias').send(carga);
    assert.equal(primera.status, 201);
    assert.equal(segunda.status, 201);
    assert.equal(segunda.body.incidencia.id, primera.body.incidencia.id);
  });
  test('existen manifiesto, service worker, cola offline y modal de tickets', () => {
    assert.ok(fs.existsSync(path.join(FRONTEND, 'manifest.webmanifest')));
    assert.ok(fs.existsSync(path.join(FRONTEND, 'sw.js')));
    assert.ok(fs.existsSync(path.join(FRONTEND, 'js/core/offline.js')));
    for (const antiguo of ['informes.html', 'tickets.html', 'js/informes.js', 'js/tickets.js']) {
      assert.equal(fs.existsSync(path.join(FRONTEND, antiguo)), false, `${antiguo} debe haberse retirado`);
    }
    const html = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
    assert.match(html, /id="modalTickets"/);
    assert.match(html, /id="ticketsModalBloqueo"/);
    assert.match(html, /id="formTicketModal"/);
    assert.match(html, /href="\/\?login=1"/);
    assert.ok(fs.existsSync(path.join(FRONTEND, 'js/controllers/ticketsModal.controller.js')));
    const controlador = fs.readFileSync(
      path.join(FRONTEND, 'js/controllers/ticketsModal.controller.js'),
      'utf8'
    );
    assert.match(controlador, /aplicarAcceso/);
    assert.match(controlador, /rol !== 'anonimo'/);
  });

  test('el service worker no cachea la API ni las evidencias', () => {
    const sw = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');
    assert.match(sw, /startsWith\('\/api\/'\)/);
    assert.match(sw, /startsWith\('\/uploads\/'\)/);
  });

  test('las rutas antiguas redirigen a los modales de la aplicación', async () => {
    const informes = await new Api(app).get('/informes?verificar=abc123');
    assert.equal(informes.status, 302);
    assert.match(informes.headers.location, /^\/(\?verificar=abc123)$/);

    const informeSimple = await new Api(app).get('/informes');
    assert.equal(informeSimple.status, 302);
    assert.match(informeSimple.headers.location, /^\/(\?informe=1)$/);

    const tickets = await new Api(app).get('/tickets?ticket=t1');
    assert.equal(tickets.status, 302);
    assert.match(tickets.headers.location, /^\/(\?ticket=t1)$/);

    const ticketSimple = await new Api(app).get('/tickets');
    assert.equal(ticketSimple.status, 302);
    assert.match(ticketSimple.headers.location, /^\/(\?tickets=1)$/);
  });
});
