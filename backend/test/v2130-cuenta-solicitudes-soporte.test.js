/** V2.13: correo como identificador, solicitudes vinculadas y soporte en modal. */
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

describe('V2.13: identidad por correo', () => {
  test('el ciudadano entra con su correo y con su nombre', async () => {
    const correo = `correo-login-${Date.now().toString(36)}@ejemplo.mx`;
    const nombre = `Persona Correo ${Date.now().toString(36)}`;
    const alta = await Api.registrar(app, {
      correo,
      password: 'segura1234',
      nombre
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.body));

    const porCorreo = await Api.entrarCiudadano(app, {
      identificador: correo,
      password: 'segura1234'
    });
    assert.equal(porCorreo.status, 200, JSON.stringify(porCorreo.body));
    assert.equal(porCorreo.body.usuario.correo, correo);

    const porNombre = await Api.entrarCiudadano(app, {
      identificador: nombre,
      password: 'segura1234'
    });
    assert.equal(porNombre.status, 200, JSON.stringify(porNombre.body));
  });

  test('la consulta de correo distingue registro y vínculo con una cuenta', async () => {
    const correo = `correo-estado-${Date.now().toString(36)}@ejemplo.mx`;
    const alta = await Api.registrar(app, {
      correo,
      password: 'segura1234',
      nombre: `Persona Estado ${Date.now().toString(36)}`
    });
    assert.equal(alta.status, 201);

    const nuevo = await request(app)
      .post('/api/publico/correo/estado')
      .send({ correo: `libre-${Date.now().toString(36)}@ejemplo.mx`, contexto: 'registro' });
    assert.equal(nuevo.status, 200);
    assert.equal(nuevo.body.disponible, true);
    assert.equal(nuevo.body.accion, 'registrar');

    const ocupado = await request(app)
      .post('/api/publico/correo/estado')
      .send({ correo, contexto: 'registro' });
    assert.equal(ocupado.status, 200);
    assert.equal(ocupado.body.disponible, false);
    assert.equal(ocupado.body.accion, 'entrar');

    const vincular = await request(app)
      .post('/api/publico/correo/estado')
      .send({ correo, contexto: 'solicitud_acceso' });
    assert.equal(vincular.status, 200);
    assert.equal(vincular.body.disponible, true);
    assert.equal(vincular.body.accion, 'vincular');
  });
});

describe('V2.13: solicitudes de acceso', () => {
  test('el rol se sugiere por territorio y la tabla muestra nombres', async () => {
    const correo = `solicitud-rol-${Date.now().toString(36)}@ejemplo.mx`;
    const creada = await request(app).post('/api/publico/solicitudes-acceso').send({
      nombre: 'Solicitud Rol',
      correo,
      // El cliente ya no debe poder imponer el rol: esta clave se ignora.
      rolSolicitado: 'auditor',
      municipios: [MUNICIPIO_MARAVATIO],
      justificacion: 'Solicitud de prueba.'
    });
    assert.equal(creada.status, 201, JSON.stringify(creada.body));
    assert.equal(creada.body.rolSugerido, 'funcionario');

    const admin = await Api.admin(app);
    const lista = await admin.get('/api/admin/solicitudes-acceso');
    assert.equal(lista.status, 200);
    const solicitud = lista.body.solicitudes.find((s) => s.folio === creada.body.folio);
    assert.ok(solicitud);
    assert.equal(solicitud.rolSugerido, 'funcionario');
    assert.deepEqual(solicitud.municipiosNombres, ['Maravatío']);
    assert.deepEqual(solicitud.estadosNombres, ['Michoacán']);
  });

  test('la administración puede cambiar el rol sugerido al aprobar', async () => {
    const correo = `rol-cambiado-${Date.now().toString(36)}@ejemplo.mx`;
    const creada = await request(app).post('/api/publico/solicitudes-acceso').send({
      nombre: 'Rol Cambiado',
      correo,
      estados: ['Michoacán'],
      justificacion: 'Solicitud estatal para revisar el rol sugerido.'
    });
    assert.equal(creada.status, 201, JSON.stringify(creada.body));
    assert.equal(creada.body.rolSugerido, 'enlace_estatal');

    const admin = await Api.admin(app);
    const lista = await admin.get('/api/admin/solicitudes-acceso');
    const solicitud = lista.body.solicitudes.find((s) => s.folio === creada.body.folio);
    const aprobada = await admin
      .post(`/api/admin/solicitudes-acceso/${solicitud.id}/aprobar`)
      .send({ rol: 'auditor', generarClave: true, claveExpiraEn: '2030-12-31' });
    assert.equal(aprobada.status, 200, JSON.stringify(aprobada.body));

    const usuarios = await admin.get('/api/usuarios');
    const cuenta = usuarios.body.usuarios.find(
      (usuario) => usuario.username === aprobada.body.usuario.username
    );
    assert.ok(cuenta);
    assert.equal(cuenta.rol, 'auditor');
  });

  test('un correo ciudadano se vincula y la aprobación promueve la misma cuenta', async () => {
    const correo = `promover-${Date.now().toString(36)}@ejemplo.mx`;
    const password = 'segura1234';
    const alta = await Api.registrar(app, {
      correo,
      password,
      nombre: `Persona Promover ${Date.now().toString(36)}`
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.body));
    const usuarioOriginal = alta.body.usuario;

    const creada = await request(app).post('/api/publico/solicitudes-acceso').send({
      nombre: 'Persona Promover',
      correo,
      municipios: [MUNICIPIO_MARAVATIO],
      justificacion: 'Ya tengo cuenta ciudadana y necesito acceso al panel.'
    });
    assert.equal(creada.status, 201, JSON.stringify(creada.body));
    assert.equal(creada.body.vinculoCuenta, true);

    const admin = await Api.admin(app);
    const lista = await admin.get('/api/admin/solicitudes-acceso');
    const solicitud = lista.body.solicitudes.find((s) => s.folio === creada.body.folio);
    assert.ok(solicitud.usuarioVinculado);
    assert.equal(solicitud.usuarioVinculado.id, usuarioOriginal.id);

    const aprobada = await admin
      .post(`/api/admin/solicitudes-acceso/${solicitud.id}/aprobar`)
      .send({ rol: 'funcionario', generarClave: true, claveExpiraEn: '2030-12-31' });
    assert.equal(aprobada.status, 200, JSON.stringify(aprobada.body));
    assert.equal(aprobada.body.promovida, true);
    assert.equal(aprobada.body.usuario.id, usuarioOriginal.id);
    assert.equal(aprobada.body.password, null);

    const acceso = await request(app).post('/api/auth/funcionario').send({
      username: correo,
      password,
      claveAcceso: aprobada.body.clave.codigo
    });
    assert.equal(acceso.status, 200, JSON.stringify(acceso.body));
    assert.equal(acceso.body.usuario.rol, 'funcionario');
    assert.equal(acceso.body.usuario.id, usuarioOriginal.id);
  });

  test('un correo de personal no crea una segunda cuenta', async () => {
    const admin = await Api.admin(app);
    const correo = `personal-${Date.now().toString(36)}@ejemplo.mx`;
    const credenciales = {
      username: `soporte${Date.now().toString(36)}`,
      nombre: 'Soporte Prueba',
      correo,
      rol: 'soporte',
      municipios: [MUNICIPIO_MARAVATIO],
      password: 'segura1234',
      generarClave: true,
      claveExpiraEn: '2030-12-31'
    };
    const creado = await admin.post('/api/usuarios', credenciales);
    assert.equal(creado.status, 201, JSON.stringify(creado.body));

    const solicitud = await request(app).post('/api/publico/solicitudes-acceso').send({
      nombre: 'Soporte Prueba',
      correo,
      municipios: [MUNICIPIO_MARAVATIO]
    });
    assert.equal(solicitud.status, 409);
    assert.match(String(solicitud.body.error), /ya tiene acceso/i);
  });
});

describe('V2.13: soporte en modal y endpoints', () => {
  test('el personal de atención se consulta con permiso de tickets', async () => {
    const admin = await Api.admin(app);
    const personal = await admin.get('/api/tickets/staff');
    assert.equal(personal.status, 200, JSON.stringify(personal.body));
    assert.ok(Array.isArray(personal.body.personal));
    assert.ok(personal.body.personal.every((p) => p.username && p.rol));
  });

  test('el detalle incluye descripción y acciones; la vista vieja redirige', async () => {
    const ciudadano = await Api.ciudadano(app);
    const ticket = await ciudadano.post('/api/tickets').send({
      asunto: 'Ticket de prueba V2.13',
      cuerpo: 'Descripción original que debe ver el equipo.',
      municipioId: MUNICIPIO_MARAVATIO
    });
    assert.equal(ticket.status, 201, JSON.stringify(ticket.body));

    const admin = await Api.admin(app);
    const detalle = await admin.get(`/api/tickets/${ticket.body.ticket.id}`);
    assert.equal(detalle.status, 200);
    assert.equal(detalle.body.ticket.cuerpo, 'Descripción original que debe ver el equipo.');
    assert.ok(Array.isArray(detalle.body.ticket.transiciones));
    assert.equal(detalle.body.ticket.acciones.asignar, true);

    const redireccion = await request(app).get(`/soporte?ticket=${ticket.body.ticket.id}`);
    assert.equal(redireccion.status, 302);
    assert.match(redireccion.headers.location, /^\/\?ticket=/);
  });
});
