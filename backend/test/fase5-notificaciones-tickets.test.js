/**
 * Fase 5: notificaciones centralizadas y cadena de soporte de tickets.
 *
 * Cubre lo que antes no existía: sugerencias y tickets que avisan, asignación
 * automática y manual, notas internas, preferencias por evento y configuración
 * global por evento.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

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

async function crearSoporte(admin, { username = 'soporte1', eventos } = {}) {
  const alta = await admin.post('/api/usuarios').send({
    username,
    nombre: 'Sofía Soporte',
    rol: 'soporte',
    municipios: [MUNICIPIO_MARAVATIO],
    password: 'segura1234',
    generarClave: true,
    claveExpiraEn: '2030-12-31'
  });
  assert.equal(alta.status, 201, JSON.stringify(alta.body));
  const entrada = await Api.entrarFuncionario(app, {
    username,
    password: 'segura1234',
    claveAcceso: alta.body.clave.codigo
  });
  assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
  return { api: new Api(app, entrada.body.token), usuario: entrada.body.usuario, eventos };
}

/** Extrae los eventos del buzón de una cuenta. */
async function eventosDe(api) {
  const r = await api.get('/api/notificaciones');
  assert.equal(r.status, 200);
  return r.body.notificaciones.map((n) => n.evento);
}

describe('Fase 5: notificaciones de sugerencias y solicitudes', () => {
  test('una sugerencia avisa al administrador en la campana', async () => {
    const admin = await Api.admin(app);
    const antes = await eventosDe(admin);

    const alta = await request(app).post('/api/publico/sugerencias').send({
      mensaje: 'Me gustaría que el mapa cargue más rápido en el celular.',
      tipo: 'mejora',
      nombre: 'Vecina'
    });
    assert.equal(alta.status, 201);

    const despues = await eventosDe(admin);
    assert.ok(despues.includes('sugerencia_creada'));
    assert.ok(despues.length > antes.length);
  });

  test('la configuración global puede silenciar un evento', async () => {
    const admin = await Api.admin(app);
    const apagado = await admin.put('/api/admin/notificaciones/config/ticket_creado').send({
      activo: false,
      canal: 'app',
      roles: ['admin'],
      alcance: 'todos'
    });
    assert.equal(apagado.status, 200);

    const ciudadano = await Api.ciudadanoConCuenta(app);
    const ticket = await ciudadano.api.post('/api/tickets').send({
      asunto: 'No puedo subir una foto',
      cuerpo: 'Al adjuntar la foto se queda cargando para siempre.',
      prioridad: 'media'
    });
    assert.equal(ticket.status, 201);
    assert.ok(!(await eventosDe(admin)).includes('ticket_creado'));

    // Se vuelve a activar para el resto de pruebas.
    const encendido = await admin.put('/api/admin/notificaciones/config/ticket_creado').send({
      activo: true,
      canal: 'app',
      roles: ['admin', 'soporte'],
      alcance: 'asignados'
    });
    assert.equal(encendido.status, 200);
  });

  test('una preferencia por evento «ninguno» corta solo ese aviso', async () => {
    const admin = await Api.admin(app);
    const soporte = await crearSoporte(admin, { username: 'soporte2' });

    // Acepta el aviso de ticket nuevo pero silencia la asignación.
    const pref = await soporte.api.put('/api/notificaciones/preferencias').send({
      modo: 'asignados',
      eventos: { ticket_asignado: 'ninguno' }
    });
    assert.equal(pref.status, 200);

    const ciudadano = await Api.ciudadanoConCuenta(app);
    const ticket = await ciudadano.api.post('/api/tickets').send({
      asunto: 'Error al exportar un informe',
      cuerpo: 'El botón de exportar no descarga nada en el navegador.',
      prioridad: 'alta'
    });

    const asignado = await admin
      .patch(`/api/tickets/${ticket.body.ticket.id}/asignacion`)
      .send({ asignadoA: 'soporte2', nota: 'Es del módulo de informes' });
    assert.equal(asignado.status, 200);
    assert.ok(!(await eventosDe(soporte.api)).includes('ticket_asignado'));
  });
});

describe('Fase 5: cadena de soporte', () => {
  test('el soporte ve la cola, responde y el autor recibe el aviso', async () => {
    const admin = await Api.admin(app);
    const soporte = await crearSoporte(admin, { username: 'soporte3' });
    const ciudadano = await Api.ciudadanoConCuenta(app);

    const creado = await ciudadano.api.post('/api/tickets').send({
      asunto: 'No veo mis notificaciones',
      cuerpo: 'Desde ayer la campana no muestra nada nuevo.',
      prioridad: 'media'
    });
    assert.equal(creado.status, 201);
    const id = creado.body.ticket.id;

    const cola = await soporte.api.get('/api/tickets?asignacion=sin');
    assert.equal(cola.status, 200);
    assert.ok(cola.body.tickets.some((t) => t.id === id));

    const respuesta = await soporte.api.post(`/api/tickets/${id}/mensajes`).send({
      texto: 'Revisamos tu cuenta y ya deberías recibir los avisos.'
    });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.ticket.estado, 'respondido');
    assert.ok((await eventosDe(ciudadano.api)).includes('ticket_respondido'));

    // El autor ve la respuesta y el hilo.
    const detalle = await ciudadano.api.get(`/api/tickets/${id}`);
    assert.equal(detalle.status, 200);
    assert.ok(detalle.body.ticket.mensajes.some((m) => m.cuerpo.includes('Revisamos')));

    // Y puede cerrarlo de nuevo respondiendo, lo que lo reabre.
    const reabre = await ciudadano.api.post(`/api/tickets/${id}/mensajes`).send({
      texto: 'Sigue sin funcionar, adjunto captura mental.'
    });
    assert.equal(reabre.status, 200);
    assert.equal(reabre.body.ticket.estado, 'abierto');

    const cierre = await soporte.api.patch(`/api/tickets/${id}/estado`).send({
      estado: 'cerrado'
    });
    assert.equal(cierre.status, 200);
    assert.ok((await eventosDe(ciudadano.api)).includes('ticket_cerrado'));
  });

  test('las notas internas no las ve el autor', async () => {
    const admin = await Api.admin(app);
    const soporte = await crearSoporte(admin, { username: 'soporte4' });
    const ciudadano = await Api.ciudadanoConCuenta(app);

    const creado = await ciudadano.api.post('/api/tickets').send({
      asunto: 'Consulta sobre mi contraseña',
      cuerpo: 'Quiero saber cómo cambiar la contraseña de mi cuenta.',
      prioridad: 'baja'
    });
    const id = creado.body.ticket.id;

    const nota = await soporte.api.post(`/api/tickets/${id}/mensajes`).send({
      texto: 'Nota interna: verificar si el correo está duplicado.',
      interno: true
    });
    assert.equal(nota.status, 200);

    const detalle = await ciudadano.api.get(`/api/tickets/${id}`);
    assert.ok(!detalle.body.ticket.mensajes.some((m) => m.interno));
    assert.deepEqual(detalle.body.ticket.eventos, []);
  });

  test('un ciudadano no puede asignar ni cambiar prioridad', async () => {
    const ciudadano = await Api.ciudadanoConCuenta(app);
    const creado = await ciudadano.api.post('/api/tickets').send({
      asunto: 'Error de visualización en el mapa',
      cuerpo: 'Los pines aparecen corridos en pantallas pequeñas.',
      prioridad: 'media'
    });
    const id = creado.body.ticket.id;

    const asignar = await ciudadano.api.patch(`/api/tickets/${id}/asignacion`).send({
      asignadoA: 'soporte1'
    });
    assert.equal(asignar.status, 403);

    const prioridad = await ciudadano.api.patch(`/api/tickets/${id}/prioridad`).send({
      prioridad: 'alta'
    });
    assert.equal(prioridad.status, 403);
  });

  test('soporte puede asignar un ticket a otra cuenta de soporte', async () => {
    const admin = await Api.admin(app);
    const soporteA = await crearSoporte(admin, { username: 'soporteA' });
    const soporteB = await crearSoporte(admin, { username: 'soporteB' });
    const ciudadano = await Api.ciudadanoConCuenta(app);
    const creado = await ciudadano.api.post('/api/tickets').send({
      asunto: 'No puedo descargar el informe',
      cuerpo: 'El botón de descarga no responde en el navegador.',
      prioridad: 'media'
    });
    assert.equal(creado.status, 201);

    const destino = soporteB.usuario.username;
    const asignado = await soporteA.api
      .patch(`/api/tickets/${creado.body.ticket.id}/asignacion`)
      .send({ asignadoA: destino });
    assert.equal(asignado.status, 200, JSON.stringify(asignado.body));
    assert.equal(asignado.body.ticket.asignadoA, destino);
    assert.ok((await eventosDe(soporteB.api)).includes('ticket_asignado'));
  });

  test('un funcionario no puede gestionar reglas de tickets', async () => {
    const funcionario = await Api.funcionario(app);
    assert.equal((await funcionario.get('/api/admin/tickets/reglas')).status, 403);
    assert.equal(
      (
        await funcionario.post('/api/admin/tickets/reglas').send({
          prioridad: 'alta',
          asignarA: 'soporte1'
        })
      ).status,
      403
    );
  });

  test('una regla de prioridad asigna el ticket automáticamente', async () => {
    const admin = await Api.admin(app);
    const soporte = await crearSoporte(admin, { username: 'soporte5' });

    const regla = await admin.post('/api/admin/tickets/reglas').send({
      prioridad: 'alta',
      asignarA: 'soporte5'
    });
    assert.equal(regla.status, 201, JSON.stringify(regla.body));

    // La prioridad solo la puede fijar quien atiende tickets; se crea desde
    // una cuenta de administración para que la regla por «alta» aplique.
    const creado = await admin.post('/api/tickets').send({
      asunto: 'El sistema se queda en blanco al guardar',
      cuerpo: 'Al pulsar guardar la pantalla queda totalmente en blanco.',
      prioridad: 'alta',
      municipioId: MUNICIPIO_MARAVATIO
    });
    assert.equal(creado.status, 201);
    assert.equal(creado.body.ticket.prioridad, 'alta');
    assert.equal(creado.body.ticket.asignadoA, 'soporte5');
    assert.equal(creado.body.ticket.asignadoPor, 'automático');
    assert.equal(creado.body.ticket.municipioId, MUNICIPIO_MARAVATIO);
    assert.ok((await eventosDe(soporte.api)).includes('ticket_asignado'));
  });
});
