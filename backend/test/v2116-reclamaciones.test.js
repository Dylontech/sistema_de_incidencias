/**
 * V2.11.6: comentarios con imagen, PDF por incidencia, resolución con costo,
 * archivo y reclamaciones.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { estaArchivada } = await import('../src/services/estado.service.js');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

const sufijo = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function crearFuncionario(admin, nombre) {
  const creado = await admin.post('/api/usuarios').send({
    username: `${nombre}_${sufijo()}`,
    nombre: `Cuenta ${nombre}`,
    rol: 'funcionario',
    municipios: [MUNICIPIO_MARAVATIO],
    password: 'segura1234',
    generarClave: true,
    claveExpiraEn: '2030-12-31'
  });
  assert.equal(creado.status, 201, JSON.stringify(creado.body));
  const entrada = await Api.entrarFuncionario(app, {
    username: creado.body.usuario.username,
    password: 'segura1234',
    claveAcceso: creado.body.clave.codigo
  });
  assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
  return { cuenta: creado.body.usuario, api: new Api(app, entrada.body.token) };
}

async function resolverIncidencia(funcionario, id, extra = {}) {
  const respuesta = await funcionario.post(`/api/incidencias/${id}/resolucion`).send({
    solucion: 'Se reparó el bache y se compactó el material.',
    costoReparacion: 1234.5,
    ...extra
  });
  assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
  return respuesta.body.incidencia;
}

describe('V2.11.6: comentarios y adjuntos', () => {
  test('el comentario con imagen se devuelve con su adjunto en el detalle', async () => {
    const autora = await Api.ciudadano(app);
    const creada = await autora.post('/api/incidencias').send(incidenciaValida());
    assert.equal(creada.status, 201, JSON.stringify(creada.body));
    const id = creada.body.incidencia.id;

    const subida = await autora
      .post('/api/adjuntos/comentario')
      .attach('archivo', PNG, { filename: 'evidencia.png', contentType: 'image/png' });
    assert.equal(subida.status, 201, JSON.stringify(subida.body));

    const comentario = await autora.post(`/api/incidencias/${id}/comentarios`).send({
      texto: 'Adjunto la foto del detalle.',
      adjuntos: [subida.body.adjunto.id]
    });
    assert.equal(comentario.status, 201, JSON.stringify(comentario.body));

    const detalle = await autora.get(`/api/incidencias/${id}`);
    assert.equal(detalle.status, 200, JSON.stringify(detalle.body));
    const ultimo = detalle.body.incidencia.comentarios.at(-1);
    assert.equal(ultimo.adjuntos.length, 1);
    assert.match(ultimo.adjuntos[0].url, /^\/api\/adjuntos\//);
  });

  test('una sesión anónima no puede comentar', async () => {
    const anonimo = await Api.anonimo(app, `anon-${sufijo()}`);
    const creada = await anonimo.post('/api/incidencias').send(incidenciaValida());
    assert.equal(creada.status, 201, JSON.stringify(creada.body));
    const respuesta = await anonimo
      .post(`/api/incidencias/${creada.body.incidencia.id}/comentarios`)
      .send({ texto: 'Comento sin cuenta' });
    assert.equal(respuesta.status, 403, JSON.stringify(respuesta.body));
  });

  test('las imágenes citadas en un reporte solo las descarga el personal', async () => {
    const funcionario = await Api.funcionario(app);
    const vecina = await Api.ciudadanoConCuenta(app);

    const subida = await vecina.api
      .post('/api/adjuntos')
      .attach('archivo', PNG, { filename: 'chat.png', contentType: 'image/png' });
    assert.equal(subida.status, 201, JSON.stringify(subida.body));

    const disponibles = await vecina.api.get(
      `/api/contacto/funcionarios?municipioId=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(disponibles.status, 200, JSON.stringify(disponibles.body));
    const destinatario =
      disponibles.body.funcionarios.find((f) => f.username === 'funcionario') ||
      disponibles.body.funcionarios[0];
    const creado = await vecina.api.post('/api/contacto/funcionarios').send({
      municipioId: MUNICIPIO_MARAVATIO,
      funcionarioIds: [destinatario.id],
      asunto: 'Conversación reportada',
      mensaje: 'Mensaje con imagen.',
      adjuntos: [subida.body.adjunto.id]
    });
    assert.equal(creado.status, 201, JSON.stringify(creado.body));

    const reporte = await funcionario.post('/api/reportes-conversacion').send({
      canal: 'directo',
      conversacionId: creado.body.contacto.id,
      motivo: 'contenido_ofensivo',
      detalle: 'La conversación incluye una imagen ofensiva.'
    });
    assert.equal(reporte.status, 201, JSON.stringify(reporte.body));
    assert.ok(reporte.body.reporte.mensajes.some((m) => (m.adjuntos || []).length));

    const ciudadana = await vecina.api.get(`/api/adjuntos/${subida.body.adjunto.id}`);
    assert.equal(ciudadana.status, 404, JSON.stringify(ciudadana.body));
    const personal = await funcionario.get(`/api/adjuntos/${subida.body.adjunto.id}`);
    assert.equal(personal.status, 200, JSON.stringify(personal.body));
  });
});

describe('V2.11.6: PDF y resolución con costo', () => {
  test('el personal descarga el PDF de la incidencia y el ciudadano no', async () => {
    const vecina = await Api.ciudadano(app);
    const funcionario = await Api.funcionario(app);
    const creada = await vecina.post('/api/incidencias').send(incidenciaValida());
    const id = creada.body.incidencia.id;

    const pdf = await funcionario.get(`/api/incidencias/${id}/pdf`);
    assert.equal(pdf.status, 200, JSON.stringify(pdf.body));
    assert.match(pdf.headers['content-type'], /application\/pdf/);
    const paginas = (pdf.body.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.equal(paginas, 1, `El reporte corto no debe generar hojas extra (${paginas})`);

    const negado = await vecina.get(`/api/incidencias/${id}/pdf`);
    assert.equal(negado.status, 403, JSON.stringify(negado.body));
  });

  test('la resolución guarda costo, documentos e historial', async () => {
    const vecina = await Api.ciudadano(app);
    const funcionario = await Api.funcionario(app);
    const creada = await vecina.post('/api/incidencias').send(incidenciaValida());
    const id = creada.body.incidencia.id;

    const subida = await funcionario
      .post('/api/uploads')
      .attach('archivos', PNG, { filename: 'oficio.png', contentType: 'image/png' });
    assert.equal(subida.status, 201, JSON.stringify(subida.body));
    const documento = subida.body.evidencia[0];

    const resuelta = await resolverIncidencia(funcionario, id, {
      evidenciaSolucion: [documento]
    });
    assert.equal(resuelta.costoReparacion, 1234.5);
    assert.equal(resuelta.documentosResolucion.length, 1);
    const ultimo = resuelta.historial.at(-1);
    assert.match(ultimo.accion, /Costo: \$1234\.50/);
    assert.match(ultimo.accion, /1 documento/);

    const pdf = await funcionario.get(`/api/incidencias/${id}/pdf`);
    assert.equal(pdf.status, 200, JSON.stringify(pdf.body));
  });

  test('el PDF incrusta una imagen válida sin romper la generación', async () => {
    const admin = await Api.admin(app);
    const vecina = await Api.ciudadano(app);
    const creada = await vecina.post('/api/incidencias').send(incidenciaValida());
    const id = creada.body.incidencia.id;

    const imagen = fs.readFileSync(
      path.join(import.meta.dirname, '..', '..', 'frontend/vendor/leaflet/images/marker-icon.png')
    );
    const subida = await admin
      .post('/api/uploads')
      .attach('archivos', imagen, { filename: 'mapa.png', contentType: 'image/png' });
    assert.equal(subida.status, 201, JSON.stringify(subida.body));

    await resolverIncidencia(admin, id, { evidenciaSolucion: [subida.body.evidencia[0]] });
    const pdf = await admin.get(`/api/incidencias/${id}/pdf`);
    assert.equal(pdf.status, 200, JSON.stringify(pdf.body));
    assert.ok(pdf.body.length > 500);
  });

  test('la incidencia pasa al archivo un día después de resolverse', () => {
    const ahora = new Date('2026-11-02T12:00:00.000Z');
    assert.equal(
      estaArchivada({ estado: 'resuelta', fechaResolucion: '2026-11-01T11:00:00.000Z' }, ahora),
      true
    );
    assert.equal(
      estaArchivada({ estado: 'resuelta', fechaResolucion: '2026-11-02T06:00:00.000Z' }, ahora),
      false
    );
    assert.equal(estaArchivada({ estado: 'en_proceso' }, ahora), false);
  });
});

describe('V2.11.6: reclamaciones', () => {
  test('se reclama, se avisa al municipio y se reabre la incidencia', async () => {
    const admin = await Api.admin(app);
    const vecina = await Api.ciudadanoConCuenta(app);
    const funcionario = await Api.funcionario(app);
    const creada = await vecina.api.post('/api/incidencias').send(incidenciaValida());
    const id = creada.body.incidencia.id;
    await resolverIncidencia(funcionario, id);

    const reclamacion = await vecina.api.post(`/api/incidencias/${id}/reclamaciones`).send({
      motivo: 'danos_no_reparados',
      detalle: 'El bache sigue ahí; solo pusieron una piedra.'
    });
    assert.equal(reclamacion.status, 201, JSON.stringify(reclamacion.body));
    const idReclamacion = reclamacion.body.reclamacion.id;

    const repetida = await vecina.api.post(`/api/incidencias/${id}/reclamaciones`).send({
      motivo: 'no_resuelta',
      detalle: 'Insisto en que no se resolvió el problema.'
    });
    assert.equal(repetida.status, 409, JSON.stringify(repetida.body));

    const avisos = await funcionario.get('/api/notificaciones?limite=100');
    assert.ok(
      avisos.body.notificaciones.some(
        (n) => n.evento === 'reclamacion_creada' && n.entidadId === idReclamacion
      ),
      'el funcionario recibe la reclamación'
    );

    const cola = await funcionario.get('/api/reclamaciones?estado=pendiente');
    assert.equal(cola.status, 200, JSON.stringify(cola.body));
    assert.ok(cola.body.reclamaciones.some((r) => r.id === idReclamacion));

    const decision = await funcionario.patch(`/api/reclamaciones/${idReclamacion}/resolver`).send({
      decision: 'revertir',
      respuesta: 'Se revisó en campo y se reabre para reparar el tramo completo.'
    });
    assert.equal(decision.status, 200, JSON.stringify(decision.body));
    assert.equal(decision.body.incidencia.estado, 'en_proceso');

    const incidente = await vecina.api.get(`/api/incidencias/${id}`);
    assert.equal(incidente.body.incidencia.estado, 'en_proceso');

    const avisosVecina = await vecina.api.get('/api/notificaciones?limite=100');
    assert.ok(
      avisosVecina.body.notificaciones.some(
        (n) => n.evento === 'reclamacion_resuelta' && n.entidadId === idReclamacion
      ),
      'la persona que reclamó recibe la decisión'
    );

    const informe = await vecina.api.get(`/api/reclamaciones/${idReclamacion}/informe`);
    assert.equal(informe.status, 200, JSON.stringify(informe.body));
    assert.match(informe.headers['content-type'], /application\/pdf/);
  });

  test('la administración puede delegar y solo el delegado decide', async () => {
    const admin = await Api.admin(app);
    const vecina = await Api.ciudadanoConCuenta(app);
    const titular = await crearFuncionario(admin, 'titular');
    const delegado = await crearFuncionario(admin, 'delegado');
    const creada = await vecina.api.post('/api/incidencias').send(incidenciaValida());
    const id = creada.body.incidencia.id;
    await resolverIncidencia(titular.api, id);

    const reclamacion = await vecina.api.post(`/api/incidencias/${id}/reclamaciones`).send({
      motivo: 'solucion_incompleta',
      detalle: 'Solo taparon una parte y el resto sigue roto.'
    });
    assert.equal(reclamacion.status, 201, JSON.stringify(reclamacion.body));
    const idReclamacion = reclamacion.body.reclamacion.id;

    const noAdmin = await titular.api
      .patch(`/api/reclamaciones/${idReclamacion}/delegar`)
      .send({ delegadoA: delegado.cuenta.username });
    assert.equal(noAdmin.status, 403, JSON.stringify(noAdmin.body));

    const delegacion = await admin
      .patch(`/api/reclamaciones/${idReclamacion}/delegar`)
      .send({ delegadoA: delegado.cuenta.username });
    assert.equal(delegacion.status, 200, JSON.stringify(delegacion.body));
    assert.equal(delegacion.body.reclamacion.delegadoA, delegado.cuenta.username);
    assert.equal(delegacion.body.reclamacion.estado, 'en_revision');

    const avisos = await delegado.api.get('/api/notificaciones?limite=100');
    assert.ok(
      avisos.body.notificaciones.some(
        (n) => n.evento === 'reclamacion_delegada' && n.entidadId === idReclamacion
      )
    );

    const ajeno = await titular.api
      .patch(`/api/reclamaciones/${idReclamacion}/resolver`)
      .send({ decision: 'mantener', respuesta: 'Decisión del funcionario titular.' });
    assert.equal(ajeno.status, 403, JSON.stringify(ajeno.body));

    const decide = await delegado.api
      .patch(`/api/reclamaciones/${idReclamacion}/resolver`)
      .send({ decision: 'mantener', respuesta: 'Se verificó y la reparación está completa.' });
    assert.equal(decide.status, 200, JSON.stringify(decide.body));
    assert.equal(decide.body.reclamacion.estado, 'rechazada');

    const incidente = await vecina.api.get(`/api/incidencias/${id}`);
    assert.equal(incidente.body.incidencia.estado, 'resuelta');
  });

  test('solo un anónimo no puede reclamar y un ciudadano no ve la cola', async () => {
    const vecina = await Api.ciudadano(app);
    const anonimo = await Api.anonimo(app, `anon-${sufijo()}`);
    const creada = await vecina.post('/api/incidencias').send(incidenciaValida());
    const id = creada.body.incidencia.id;
    const funcionario = await Api.funcionario(app);
    await resolverIncidencia(funcionario, id);

    const negada = await anonimo.post(`/api/incidencias/${id}/reclamaciones`).send({
      motivo: 'otro',
      detalle: 'Reclamo sin tener cuenta registrada.'
    });
    assert.equal(negada.status, 403, JSON.stringify(negada.body));

    const cola = await vecina.get('/api/reclamaciones');
    assert.equal(cola.status, 403, JSON.stringify(cola.body));
  });
});
