import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { prepararEntorno, prepararBaseDeDatos } from './helpers/entorno.js';
import { Api, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');
const { firmarToken, verificarToken } = await import('../src/utils/jwt.js');
const app = crearApp();
const repo = await obtenerRepositorio();
after(() => entorno.limpiar());

test('la identidad pública anónima no permite recuperar la autoría; el secreto sí', async () => {
  const original = await request(app).post('/api/auth/anonimo').send({});
  const autor = new Api(app, original.body.token);
  const creada = await autor.post('/api/incidencias', incidenciaValida());
  assert.equal(creada.status, 201);
  const visitante = await Api.anonimo(app, 'visitante-integridad');
  const listado = await visitante.get('/api/incidencias');
  const publica = listado.body.incidencias.find((i) => i.id === creada.body.incidencia.id);
  assert.ok(publica);
  assert.ok(!JSON.stringify(publica).includes(original.body.anonId));
  const imitacion = await request(app).post('/api/auth/anonimo')
    .send({ anonId: publica.userKey.slice(5) });
  const intruso = new Api(app, imitacion.body.token);
  const rechazo = await intruso.put(`/api/incidencias/${publica.id}`, { titulo: 'Edición ajena' });
  assert.equal(rechazo.status, 403);
  const recuperada = await request(app).post('/api/auth/anonimo')
    .send({ anonId: original.body.anonId });
  assert.equal(recuperada.body.usuario.userKey, original.body.usuario.userKey);
  const legitimo = new Api(app, recuperada.body.token);
  assert.equal((await legitimo.put(`/api/incidencias/${publica.id}`, { titulo: 'Edición propia' })).status, 200);
});

test('un JWT anónimo del esquema expuesto deja de autenticar', () => {
  const antiguo = firmarToken({ rol: 'anonimo', userKey: 'anon_publico', username: 'anonimo_publico' });
  assert.equal(verificarToken(antiguo), null);
});

test('la auditoría omite el secreto anónimo de cuerpo y query', async () => {
  const { auditar } = await import('../src/middlewares/auditoria.js');
  const secreto = 'b'.repeat(64);
  let finalizar;
  let registro;
  const req = {
    method: 'POST', originalUrl: '/api/auth/anonimo',
    body: { anonId: secreto }, query: { anonId: secreto }, params: {}, headers: {},
    is: () => false,
    repositorio: { registrarAuditoria: async (valor) => { registro = valor; } }
  };
  const res = { statusCode: 201, json: (v) => v, on: (_evento, fn) => { finalizar = fn; } };
  auditar(req, res, () => {});
  finalizar();
  assert.ok(registro);
  assert.ok(!JSON.stringify(registro).includes(secreto));
  const detalle = JSON.parse(registro.detalle);
  assert.equal(detalle.body.anonId, '[omitido]');
  assert.equal(detalle.query.anonId, '[omitido]');
});

test('dos envíos HTTP simultáneos con la misma clave crean un solo reporte', async () => {
  const autor = await Api.anonimo(app, 'idempotencia-integridad');
  const datos = incidenciaValida({ claveIdempotencia: 'envio-concurrente' });
  const respuestas = await Promise.all([autor.post('/api/incidencias', datos), autor.post('/api/incidencias', datos)]);
  assert.deepEqual(respuestas.map((r) => r.status), [201, 201]);
  assert.equal(respuestas[0].body.incidencia.id, respuestas[1].body.incidencia.id);
  const filas = (await repo.todasLasIncidencias()).filter((i) => i.claveIdempotencia === datos.claveIdempotencia);
  assert.equal(filas.length, 1);
});

test('el almacenamiento rechaza una copia obsoleta sin perder el estado ni el historial', async () => {
  const autor = await Api.anonimo(app, 'revision-integridad');
  const respuesta = await autor.post('/api/incidencias', incidenciaValida());
  const original = await repo.incidenciaPorId(respuesta.body.incidencia.id);
  const estado = { ...original, estado: 'en_proceso', historial: [...original.historial, {
    fecha: new Date().toISOString(), estado: 'en_proceso', accion: 'Cambio concurrente', por: 'Prueba'
  }] };
  await repo.actualizarIncidencia(original.id, estado);
  await assert.rejects(repo.actualizarIncidencia(original.id, { ...original, titulo: 'Copia antigua' }),
    (error) => error.estado === 409);
  const guardada = await repo.incidenciaPorId(original.id);
  assert.equal(guardada.estado, 'en_proceso');
  assert.equal(guardada.historial.at(-1).accion, 'Cambio concurrente');
  assert.equal(guardada.revision, 1);
  const siguiente = await repo.actualizarIncidencia(original.id, { ...guardada, titulo: 'Copia reciente' });
  assert.equal(siguiente.revision, 2);
});

test('crear, modificar y borrar comentarios invalida las copias anteriores del reporte', async () => {
  const autor = await Api.anonimo(app, 'comentario-integridad');
  const respuesta = await autor.post('/api/incidencias', incidenciaValida());
  const id = respuesta.body.incidencia.id;
  let anterior = await repo.incidenciaPorId(id);
  const comentario = { id: 'comentario-integridad', fecha: new Date().toISOString(), autor: 'Prueba', texto: 'Texto inicial' };
  const acciones = [
    () => repo.crearComentarioIncidencia(id, comentario),
    () => repo.actualizarComentarioIncidencia(id, comentario.id, { texto: 'Texto cambiado' }),
    () => repo.eliminarComentarioIncidencia(id, comentario.id)
  ];
  for (const accion of acciones) {
    await accion();
    await assert.rejects(repo.actualizarIncidencia(id, anterior), (error) => error.estado === 409);
    anterior = await repo.incidenciaPorId(id);
  }
  assert.equal(anterior.comentarios.length, 0);
  assert.equal(anterior.revision, 3);
});

test('la migración conserva reportes con claves duplicadas y activa el índice único',
  { skip: entorno.driver !== 'mysql' }, async () => {
    const autor = await Api.anonimo(app, 'migracion-integridad');
    assert.equal((await autor.post('/api/incidencias', incidenciaValida())).status, 201);
    const migracion = await import('../db/migrations/20261124_integridad_incidencias.js');
    await migracion.down(repo.knex);
    const base = await repo.knex('incidencias').first();
    const clave = 'duplicada-antes-de-migrar';
    await repo.knex('incidencias').insert([
      { ...base, id: 'migracion-duplicada-a', folio: null, clave_idempotencia: clave },
      { ...base, id: 'migracion-duplicada-b', folio: null, clave_idempotencia: clave }
    ]);
    const [{ total: antes }] = await repo.knex('incidencias').count({ total: '*' });
    await migracion.up(repo.knex);
    const [{ total: despues }] = await repo.knex('incidencias').count({ total: '*' });
    assert.equal(Number(antes), Number(despues));
    const filas = await repo.knex('incidencias').whereIn('id', ['migracion-duplicada-a', 'migracion-duplicada-b']).orderBy('id');
    assert.equal(filas[0].clave_idempotencia, clave);
    assert.equal(filas[1].clave_idempotencia, null);
    assert.equal(Number(filas[0].revision), 0);
    await assert.rejects(async () => repo.knex('incidencias').insert({ ...filas[0], id: 'migracion-duplicada-c' }),
      (error) => error.code === 'ER_DUP_ENTRY');
  });
