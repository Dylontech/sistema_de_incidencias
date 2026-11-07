/**
 * V2.11.4: reportes de conversación y medidas reversibles.
 *
 * Cubre lo que pidió la versión:
 * - cualquier participante reporta un hilo y el reporte guarda los últimos
 *   cinco mensajes de cada parte con sus adjuntos;
 * - solo quien tiene `ver_moderacion` ve la cola y solo quien tiene `moderar`
 *   la resuelve;
 * - la medida de restringir mensajes bloquea el envío del reportado y se
 *   puede levantar;
 * - la baja de la cuenta también se revierte;
 * - las tres decisiones quedan en auditoría y el autor recibe el aviso.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, CLAVE_MARAVATIO, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;

before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

const sufijo = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function crearFuncionario(admin, nombre, rol = 'funcionario') {
  const respuesta = await admin.post('/api/usuarios').send({
    username: `${nombre}_${sufijo()}`,
    nombre: `Cuenta ${nombre} V2.11.4`,
    rol,
    municipios: [MUNICIPIO_MARAVATIO],
    password: 'segura1234',
    generarClave: true,
    claveExpiraEn: '2030-12-31'
  });
  assert.equal(respuesta.status, 201, JSON.stringify(respuesta.body));
  const entrada = await Api.entrarFuncionario(app, {
    username: respuesta.body.usuario.username,
    password: 'segura1234',
    claveAcceso: respuesta.body.clave.codigo
  });
  assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
  return {
    cuenta: respuesta.body.usuario,
    api: new Api(app, entrada.body.token),
    password: 'segura1234'
  };
}

/** A escribe a B y se devuelve el hilo para seguir conversando. */
async function abrirHilo(de, para) {
  const enviado = await de.api.post('/api/mensajes', {
    paraUsuario: para.cuenta.username,
    asunto: 'Coordinación de la semana',
    cuerpo: 'Mensaje inicial del hilo.'
  });
  assert.equal(enviado.status, 201, JSON.stringify(enviado.body));
  return enviado.body.mensaje.hilo;
}

async function reportar(autor, datos = {}) {
  return autor.api.post('/api/reportes-conversacion', {
    canal: 'mensaje',
    motivo: 'contenido_ofensivo',
    detalle: 'Los mensajes incluyen descalificaciones personales.',
    ...datos
  });
}

describe('V2.11.4: reporte de una conversación', () => {
  test('guarda los últimos cinco mensajes de cada parte y avisa a moderación', async () => {
    const admin = await Api.admin(app);
    const autora = await crearFuncionario(admin, 'autora');
    const reportado = await crearFuncionario(admin, 'reportado');
    const hilo = await abrirHilo(autora, reportado);

    for (let i = 1; i <= 6; i += 1) {
      const respuesta = await reportado.api.post('/api/mensajes', {
        hilo,
        cuerpo: `Respuesta ${i} de la otra parte.`
      });
      assert.equal(respuesta.status, 201, JSON.stringify(respuesta.body));
    }
    for (let i = 1; i <= 6; i += 1) {
      const respuesta = await autora.api.post('/api/mensajes', {
        hilo,
        cuerpo: `Aclaración ${i} de la autora.`
      });
      assert.equal(respuesta.status, 201, JSON.stringify(respuesta.body));
    }

    const contexto = await autora.api.get(
      `/api/reportes-conversacion/contexto?canal=mensaje&conversacionId=${hilo}`
    );
    assert.equal(contexto.status, 200, JSON.stringify(contexto.body));
    assert.equal(contexto.body.objetivo.username, reportado.cuenta.username);

    const creado = await reportar(autora, { conversacionId: hilo });
    assert.equal(creado.status, 201, JSON.stringify(creado.body));
    const reporte = creado.body.reporte;
    assert.equal(reporte.estado, 'pendiente');
    assert.equal(reporte.objetivoUsername, reportado.cuenta.username);
    // Seis mensajes de cada parte: se recortan a los cinco últimos.
    assert.equal(reporte.mensajes.length, 10);
    const deAutora = reporte.mensajes.filter((m) => m.de === autora.cuenta.username);
    const deReportado = reporte.mensajes.filter((m) => m.de === reportado.cuenta.username);
    assert.equal(deAutora.length, 5);
    assert.equal(deReportado.length, 5);
    assert.ok(!deAutora.some((m) => m.cuerpo === 'Mensaje inicial del hilo.'));

    // Reportar dos veces la misma conversación se rechaza.
    const repetido = await reportar(autora, { conversacionId: hilo });
    assert.equal(repetido.status, 409, JSON.stringify(repetido.body));

    // Un ciudadano no entra a la cola de moderación…
    const ciudadano = await Api.ciudadano(app);
    const sinPermiso = await ciudadano.get('/api/reportes-conversacion');
    assert.equal(sinPermiso.status, 403, JSON.stringify(sinPermiso.body));

    const cola = await admin.get('/api/reportes-conversacion');
    assert.equal(cola.status, 200, JSON.stringify(cola.body));
    assert.ok(cola.body.reportes.some((r) => r.id === reporte.id));

    // …y el auditor la consulta pero no puede resolver.
    const auditor = await crearFuncionario(admin, 'auditor', 'auditor');
    const colaAuditor = await auditor.api.get('/api/reportes-conversacion');
    assert.equal(colaAuditor.status, 200, JSON.stringify(colaAuditor.body));
    const intentoAuditor = await auditor.api
      .patch(`/api/reportes-conversacion/${reporte.id}/resolver`)
      .send({ accion: 'descartar', motivo: 'Sin sanción procedente' });
    assert.equal(intentoAuditor.status, 403, JSON.stringify(intentoAuditor.body));

    const avisos = await admin.get('/api/notificaciones');
    assert.equal(avisos.status, 200, JSON.stringify(avisos.body));
    assert.ok(
      avisos.body.notificaciones.some(
        (n) => n.evento === 'reporte_conversacion_creada' && n.entidadId === reporte.id
      ),
      'la moderación recibe el aviso del reporte'
    );
  });

  test('restringir mensajes bloquea al reportado y la reversión lo libera', async () => {
    const admin = await Api.admin(app);
    const autora = await crearFuncionario(admin, 'denunciante');
    const reportado = await crearFuncionario(admin, 'sancionado');
    const hilo = await abrirHilo(autora, reportado);

    const creado = await reportar(autora, { conversacionId: hilo });
    assert.equal(creado.status, 201, JSON.stringify(creado.body));
    const id = creado.body.reporte.id;

    const resuelto = await admin.patch(`/api/reportes-conversacion/${id}/resolver`).send({
      accion: 'suspender_mensajes',
      motivo: 'Se revisaron los mensajes y se restringe el envío una semana.'
    });
    assert.equal(resuelto.status, 200, JSON.stringify(resuelto.body));
    assert.equal(resuelto.body.reporte.estado, 'resuelto');
    assert.equal(resuelto.body.reporte.accion, 'suspender_mensajes');

    const bloqueado = await reportado.api.post('/api/mensajes', {
      hilo,
      cuerpo: 'Intento de respuesta con la restricción activa.'
    });
    assert.equal(bloqueado.status, 403, JSON.stringify(bloqueado.body));

    // La otra parte sigue escribiendo.
    const autoraEscribe = await autora.api.post('/api/mensajes', {
      hilo,
      cuerpo: 'La autora puede seguir usando la mensajería.'
    });
    assert.equal(autoraEscribe.status, 201, JSON.stringify(autoraEscribe.body));

    const revertido = await admin.patch(`/api/reportes-conversacion/${id}/revertir`).send({});
    assert.equal(revertido.status, 200, JSON.stringify(revertido.body));
    assert.equal(revertido.body.reporte.estado, 'revertido');

    const liberado = await reportado.api.post('/api/mensajes', {
      hilo,
      cuerpo: 'Ya puedo responder de nuevo.'
    });
    assert.equal(liberado.status, 201, JSON.stringify(liberado.body));

    // Resolver dos veces el mismo reporte no es posible.
    const otraVez = await admin.patch(`/api/reportes-conversacion/${id}/resolver`).send({
      accion: 'descartar',
      motivo: 'Segundo intento'
    });
    assert.equal(otraVez.status, 409, JSON.stringify(otraVez.body));
  });

  test('la baja de la cuenta se revierte y todo queda en auditoría', async () => {
    const admin = await Api.admin(app);
    const autora = await crearFuncionario(admin, 'baja_autora');
    const reportado = await crearFuncionario(admin, 'baja_reportado');
    const hilo = await abrirHilo(autora, reportado);

    const creado = await reportar(autora, { conversacionId: hilo });
    assert.equal(creado.status, 201, JSON.stringify(creado.body));
    const id = creado.body.reporte.id;

    const baja = await admin.patch(`/api/reportes-conversacion/${id}/resolver`).send({
      accion: 'baja_cuenta',
      motivo: 'La conversación incluye amenazas reiteradas.'
    });
    assert.equal(baja.status, 200, JSON.stringify(baja.body));

    const sinCuenta = await Api.entrarFuncionario(app, {
      username: reportado.cuenta.username,
      password: reportado.password,
      claveMunicipio: CLAVE_MARAVATIO
    });
    assert.notEqual(sinCuenta.status, 200, JSON.stringify(sinCuenta.body));

    const revertido = await admin.patch(`/api/reportes-conversacion/${id}/revertir`).send({});
    assert.equal(revertido.status, 200, JSON.stringify(revertido.body));

    const deVuelta = await Api.entrarFuncionario(app, {
      username: reportado.cuenta.username,
      password: reportado.password,
      claveMunicipio: CLAVE_MARAVATIO
    });
    assert.equal(deVuelta.status, 200, JSON.stringify(deVuelta.body));

    const acciones = [];
    for (const accion of [
      'reporte_conversacion_creado',
      'reporte_conversacion_resuelto',
      'reporte_conversacion_revertido'
    ]) {
      const bitacora = await admin.get(`/api/admin/auditoria?accion=${accion}`);
      assert.equal(bitacora.status, 200, JSON.stringify(bitacora.body));
      acciones.push(...(bitacora.body.registros || []).map((registro) => registro.accion));
    }
    assert.ok(acciones.includes('reporte_conversacion_creado'));
    assert.ok(acciones.includes('reporte_conversacion_resuelto'));
    assert.ok(acciones.includes('reporte_conversacion_revertido'));
  });

  test('exige motivo de la lista, detalle suficiente y conversación propia', async () => {
    const admin = await Api.admin(app);
    const autora = await crearFuncionario(admin, 'valida');
    const reportado = await crearFuncionario(admin, 'valida_otro');
    const hilo = await abrirHilo(autora, reportado);

    const sinMotivo = await reportar(autora, { conversacionId: hilo, motivo: 'inventado' });
    assert.equal(sinMotivo.status, 400, JSON.stringify(sinMotivo.body));

    const sinDetalle = await reportar(autora, { conversacionId: hilo, detalle: 'corto' });
    assert.equal(sinDetalle.status, 400, JSON.stringify(sinDetalle.body));

    const ajena = await reportar(autora, { conversacionId: 'no-existe' });
    assert.notEqual(ajena.status, 201, JSON.stringify(ajena.body));
  });
});
