/**
 * V2.11.5: bloqueos personales, mensajes opcionales en el reporte y datos del
 * constructor de informes.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, incidenciaValida, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

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
  return {
    cuenta: creado.body.usuario,
    api: new Api(app, entrada.body.token)
  };
}

async function abrirHilo(de, para) {
  const enviado = await de.api.post('/api/mensajes', {
    paraUsuario: para.cuenta.username,
    asunto: 'Coordinación',
    cuerpo: 'Mensaje inicial.'
  });
  assert.equal(enviado.status, 201, JSON.stringify(enviado.body));
  return enviado.body.mensaje.hilo;
}

describe('V2.11.5: bloqueos entre cuentas', () => {
  test('bloquear corta los mensajes en los dos sentidos y se deshace', async () => {
    const admin = await Api.admin(app);
    const autora = await crearFuncionario(admin, 'bloquea');
    const otra = await crearFuncionario(admin, 'bloqueado');
    const hilo = await abrirHilo(autora, otra);

    const bloqueo = await autora.api.post('/api/bloqueos').send({
      username: otra.cuenta.username,
      motivo: 'Mensajes insistentes'
    });
    assert.equal(bloqueo.status, 201, JSON.stringify(bloqueo.body));
    assert.equal(bloqueo.body.bloqueo.bloqueadoUsername, otra.cuenta.username);

    const respuestaBloqueada = await otra.api.post('/api/mensajes', {
      hilo,
      cuerpo: 'Intento de respuesta con bloqueo.'
    });
    assert.equal(respuestaBloqueada.status, 403, JSON.stringify(respuestaBloqueada.body));

    const propiaBloqueada = await autora.api.post('/api/mensajes', {
      hilo,
      cuerpo: 'La autora tampoco puede escribirle.'
    });
    assert.equal(propiaBloqueada.status, 403, JSON.stringify(propiaBloqueada.body));

    const lista = await autora.api.get('/api/bloqueos');
    assert.equal(lista.status, 200, JSON.stringify(lista.body));
    assert.ok(lista.body.bloqueos.some((b) => b.bloqueadoUsername === otra.cuenta.username));

    const desbloqueo = await autora.api.delete(
      `/api/bloqueos/${encodeURIComponent(otra.cuenta.username)}`
    );
    assert.equal(desbloqueo.status, 200, JSON.stringify(desbloqueo.body));

    const liberado = await otra.api.post('/api/mensajes', {
      hilo,
      cuerpo: 'Ya puedo responder.'
    });
    assert.equal(liberado.status, 201, JSON.stringify(liberado.body));

    const aSiMisma = await autora.api.post('/api/bloqueos').send({
      username: autora.cuenta.username
    });
    assert.equal(aSiMisma.status, 400, JSON.stringify(aSiMisma.body));
  });

  test('un bloqueo impide responder un contacto directo', async () => {
    const personal = await Api.funcionario(app);
    const vecina = await Api.ciudadanoConCuenta(app);
    const disponibles = await vecina.api.get(
      `/api/contacto/funcionarios?municipioId=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(disponibles.status, 200, JSON.stringify(disponibles.body));
    const destinatario = disponibles.body.funcionarios[0];
    assert.ok(destinatario);

    const creado = await vecina.api.post('/api/contacto/funcionarios').send({
      municipioId: MUNICIPIO_MARAVATIO,
      funcionarioIds: [destinatario.id],
      asunto: 'Consulta',
      mensaje: 'Necesito ayuda con un reporte.'
    });
    assert.equal(creado.status, 201, JSON.stringify(creado.body));

    const bloqueo = await personal.post('/api/bloqueos').send({
      username: vecina.usuario.username
    });
    assert.equal(bloqueo.status, 201, JSON.stringify(bloqueo.body));

    const respuesta = await vecina.api
      .post(`/api/contacto/directo/${creado.body.contacto.id}/mensajes`)
      .send({ cuerpo: '¿Sigue ahí?' });
    assert.equal(respuesta.status, 403, JSON.stringify(respuesta.body));

    await personal.delete(`/api/bloqueos/${encodeURIComponent(vecina.usuario.username)}`);
    const despues = await vecina.api
      .post(`/api/contacto/directo/${creado.body.contacto.id}/mensajes`)
      .send({ cuerpo: 'Gracias por responder.' });
    assert.equal(despues.status, 201, JSON.stringify(despues.body));
  });
});

describe('V2.11.5: reporte sin mensajes adjuntos', () => {
  test('guarda solo la descripción cuando el autor no adjunta la conversación', async () => {
    const admin = await Api.admin(app);
    const autora = await crearFuncionario(admin, 'sin_mensajes');
    const otra = await crearFuncionario(admin, 'reportada');
    const hilo = await abrirHilo(autora, otra);

    const creado = await autora.api.post('/api/reportes-conversacion').send({
      canal: 'mensaje',
      conversacionId: hilo,
      motivo: 'contenido_ofensivo',
      detalle: 'Los mensajes fueron ofensivos, pero prefiero no adjuntarlos.',
      incluirMensajes: false
    });
    assert.equal(creado.status, 201, JSON.stringify(creado.body));
    assert.equal(creado.body.reporte.incluyeMensajes, false);
    assert.deepEqual(creado.body.reporte.mensajes, []);

    const cola = await admin.get('/api/reportes-conversacion');
    assert.equal(cola.status, 200, JSON.stringify(cola.body));
    const guardado = cola.body.reportes.find((r) => r.id === creado.body.reporte.id);
    assert.ok(guardado);
    assert.equal(guardado.incluyeMensajes, false);
  });
});

describe('V2.11.5: constructor de informes', () => {
  test('filtra por tipos, compara, omite el detalle y respeta el alcance', async () => {
    const admin = await Api.admin(app);
    const funcionario = await Api.funcionario(app);
    const tipos = await funcionario.get('/api/tipos');
    assert.equal(tipos.status, 200, JSON.stringify(tipos.body));
    const tipoA = tipos.body.tipos[0].id;
    const tipoB = tipos.body.tipos[1]?.id || tipoA;

    for (const tipoId of [tipoA, tipoB]) {
      const creada = await funcionario.post('/api/incidencias').send(incidenciaValida({ tipoId }));
      assert.equal(creada.status, 201, JSON.stringify(creada.body));
    }

    const datos = await admin.get(
      `/api/informes/datos?municipios=${MUNICIPIO_MARAVATIO}&compararPor=tipo&incluirDetalle=false`
    );
    assert.equal(datos.status, 200, JSON.stringify(datos.body));
    assert.ok(Array.isArray(datos.body.comparativa));
    assert.ok(Array.isArray(datos.body.series));
    assert.deepEqual(datos.body.detalle, []);
    assert.equal(datos.body.filtros.compararPor, 'tipo');
    assert.equal(datos.body.filtros.incluirDetalle, false);
    assert.ok(datos.body.comparativa.every((fila) => fila.total > 0));

    const deUnTipo = await admin.get(`/api/informes/datos?tipos=${tipoA}&tiposTodos=false`);
    assert.equal(deUnTipo.status, 200, JSON.stringify(deUnTipo.body));
    assert.ok(deUnTipo.body.porTipo.every((fila) => fila.tipoId === tipoA));
    assert.ok(deUnTipo.body.detalle.every((incidencia) => incidencia.tipo === deUnTipo.body.porTipo[0].nombre));

    const ciudadano = await Api.ciudadano(app);
    const prohibido = await ciudadano.get('/api/informes/datos');
    assert.equal(prohibido.status, 403, JSON.stringify(prohibido.body));
  });
});
