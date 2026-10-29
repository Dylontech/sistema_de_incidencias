/** Contacto, sugerencias y mensajería interna. */
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

describe('Contacto ciudadano', () => {
  test('el mensaje entra al buzón del municipio y el funcionario responde', async () => {
    const creado = await new Api(app).post('/api/publico/contacto', {
      nombre: 'Vecino Contacto',
      correo: 'contacto@ejemplo.mx',
      municipioId: MUNICIPIO_MARAVATIO,
      asunto: 'Luminaria apagada',
      mensaje: 'Lleva tres noches apagada la luminaria de la plaza.'
    });
    assert.equal(creado.status, 201, creado.body?.error);

    const funcionario = await Api.funcionario(app);
    const bandeja = await funcionario.get('/api/contacto');
    assert.equal(bandeja.status, 200);
    const mensaje = bandeja.body.mensajes.find((m) => m.folio === creado.body.folio);
    assert.ok(mensaje);

    const respuesta = await funcionario.post(`/api/contacto/${mensaje.id}/responder`, {
      respuesta: 'Gracias por avisar; ya se envió la orden de reparación.'
    });
    assert.equal(respuesta.status, 200, respuesta.body?.error);
    assert.equal(respuesta.body.mensaje.estado, 'respondido');
  });

  test('un funcionario no ve mensajes de un municipio ajeno', async () => {
    const creado = await new Api(app).post('/api/publico/contacto', {
      nombre: 'Vecino Morelia',
      correo: 'morelia@ejemplo.mx',
      municipioId: '16053',
      asunto: 'Bache en Morelia',
      mensaje: 'Hay un bache grande en la avenida.'
    });
    assert.equal(creado.status, 201, creado.body?.error);

    const funcionario = await Api.funcionario(app);
    const bandeja = await funcionario.get('/api/contacto');
    assert.ok(!bandeja.body.mensajes.some((m) => m.folio === creado.body.folio));
  });
});

describe('Sugerencias', () => {
  test('se crean, se consultan con folio y correo, y solo el admin las responde', async () => {
    const creada = await new Api(app).post('/api/publico/sugerencias', {
      tipo: 'mejora',
      nombre: 'Vecina Sugerencia',
      correo: 'sugerencia@ejemplo.mx',
      mensaje: 'Sería útil poder filtrar por colonia en el mapa.'
    });
    assert.equal(creada.status, 201, creada.body?.error);

    const consulta = await new Api(app).get(
      `/api/publico/sugerencias/${creada.body.folio}?correo=sugerencia@ejemplo.mx`
    );
    assert.equal(consulta.status, 200);
    assert.equal(consulta.body.folio, creada.body.folio);

    const sinCorreo = await new Api(app).get(
      `/api/publico/sugerencias/${creada.body.folio}?correo=otro@ejemplo.mx`
    );
    assert.equal(sinCorreo.status, 404);

    const funcionario = await Api.funcionario(app);
    assert.equal((await funcionario.get('/api/sugerencias')).status, 403);

    const admin = await Api.admin(app);
    const lista = await admin.get('/api/sugerencias');
    assert.equal(lista.status, 200);
    const sugerencia = lista.body.sugerencias.find((s) => s.folio === creada.body.folio);
    assert.ok(sugerencia);

    const respuesta = await admin.post(`/api/sugerencias/${sugerencia.id}/responder`, {
      respuesta: 'Gracias, lo tendremos en cuenta para la siguiente versión.'
    });
    assert.equal(respuesta.status, 200, respuesta.body?.error);
    assert.equal(respuesta.body.sugerencia.estado, 'atendida');
  });
});

describe('Mensajería interna', () => {
  test('el admin escribe al funcionario, el funcionario responde y ambos ven el hilo', async () => {
    const admin = await Api.admin(app);
    const enviado = await admin.post('/api/mensajes', {
      paraUsuario: 'funcionario',
      asunto: 'Reporte semanal',
      cuerpo: 'Revisa las incidencias críticas antes del viernes.'
    });
    assert.equal(enviado.status, 201, enviado.body?.error);
    assert.ok(enviado.body.mensaje.hilo);

    const funcionario = await Api.funcionario(app);
    const bandeja = await funcionario.get('/api/mensajes');
    assert.equal(bandeja.status, 200);
    const hilo = bandeja.body.hilos.find((h) => h.hilo === enviado.body.mensaje.hilo);
    assert.ok(hilo);
    assert.equal(hilo.noLeidos, 1);

    const detalle = await funcionario.get(`/api/mensajes/${hilo.hilo}`);
    assert.equal(detalle.status, 200);
    assert.equal(detalle.body.mensajes.length, 1);

    const respuesta = await funcionario.post('/api/mensajes', {
      hilo: hilo.hilo,
      cuerpo: 'Enterado, lo reviso hoy mismo.'
    });
    assert.equal(respuesta.status, 201, respuesta.body?.error);

    const detalleAdmin = await admin.get(`/api/mensajes/${hilo.hilo}`);
    assert.equal(detalleAdmin.status, 200);
    assert.equal(detalleAdmin.body.mensajes.length, 2);
  });

  test('un auditor no puede enviar mensajes (solo lectura)', async () => {
    const admin = await Api.admin(app);
    const creado = await admin.post('/api/usuarios', {
      username: 'auditor_msj',
      password: 'secreta123',
      nombre: 'Auditor Mensajes',
      rol: 'auditor',
      municipios: [MUNICIPIO_MARAVATIO]
    });
    assert.equal(creado.status, 201, creado.body?.error);

    const login = await Api.entrarFuncionario(app, {
      username: 'auditor_msj',
      password: 'secreta123',
      claveMunicipio: MUNICIPIO_MARAVATIO
    });
    assert.equal(login.status, 200, login.body?.error);
    const auditor = new Api(app, login.body.token);

    assert.equal((await auditor.get('/api/mensajes')).status, 200);
    assert.equal(
      (
        await auditor.post('/api/mensajes', {
          paraUsuario: 'admin',
          asunto: 'No debería',
          cuerpo: 'Un auditor no escribe.'
        })
      ).status,
      403
    );
  });
});
