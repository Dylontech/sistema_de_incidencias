/**
 * Campañas de promoción: doble opt-in, baja en un clic, lista de supresión,
 * segmentos y envío simulado por lotes.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');
const campanas = await import('../src/services/campanas.service.js');

let app;
let repositorio;

before(async () => {
  app = crearApp();
  repositorio = await obtenerRepositorio();
});

after(() => entorno.limpiar());

async function suscribirYConfirmar(correo, extra = {}) {
  const publico = new Api(app);
  const alta = await publico.post('/api/publico/suscripciones', {
    correo,
    nombre: 'Persona Suscriptora',
    municipioId: MUNICIPIO_MARAVATIO,
    aceptaAviso: true,
    ...extra
  });
  assert.equal(alta.status, 201, alta.body?.error);
  assert.equal(alta.body.estado, 'pendiente');

  const guardada = await repositorio.suscripcionPorCorreo(correo);
  assert.ok(guardada?.token);

  const confirmada = await publico.post('/api/publico/suscripciones/confirmar', {
    token: guardada.token
  });
  assert.equal(confirmada.status, 200, confirmada.body?.error);
  assert.equal(confirmada.body.estado, 'activa');
  return guardada;
}

describe('Campañas de promoción por correo', () => {
  test('la suscripción exige aceptar el aviso y confirmar el correo', async () => {
    const publico = new Api(app);

    const sinAviso = await publico.post('/api/publico/suscripciones', {
      correo: 'sin-aviso@ejemplo.mx'
    });
    assert.equal(sinAviso.status, 400);

    const correoInvalido = await publico.post('/api/publico/suscripciones', {
      correo: 'no-es-un-correo',
      aceptaAviso: true
    });
    assert.equal(correoInvalido.status, 400);

    const alta = await publico.post('/api/publico/suscripciones', {
      correo: 'promocion@ejemplo.mx',
      nombre: 'Vecina Promoción',
      municipioId: MUNICIPIO_MARAVATIO,
      aceptaAviso: true
    });
    assert.equal(alta.status, 201, alta.body?.error);
    assert.equal(alta.body.estado, 'pendiente');

    const guardada = await repositorio.suscripcionPorCorreo('promocion@ejemplo.mx');
    assert.equal(guardada.estado, 'pendiente');

    // Sin confirmar, no entra en ningún envío.
    const activas = await repositorio.suscripcionesCorreo({ estado: 'activa' });
    assert.ok(!activas.some((s) => s.correo === 'promocion@ejemplo.mx'));

    const confirmada = await publico.post('/api/publico/suscripciones/confirmar', {
      token: guardada.token
    });
    assert.equal(confirmada.status, 200, confirmada.body?.error);
    assert.equal(confirmada.body.estado, 'activa');

    // El mismo enlace es idempotente y no rompe la baja.
    const repetida = await publico.post('/api/publico/suscripciones/confirmar', {
      token: guardada.token
    });
    assert.equal(repetida.status, 200);
    assert.equal(repetida.body.estado, 'activa');

    const invalido = await publico.post('/api/publico/suscripciones/confirmar', {
      token: 'token-inexistente'
    });
    assert.equal(invalido.status, 404);
  });

  test('solo un administrador gestiona campañas y suscriptores', async () => {
    const funcionario = await Api.funcionario(app);
    assert.equal((await funcionario.get('/api/admin/campanas')).status, 403);
    assert.equal((await funcionario.get('/api/admin/suscripciones')).status, 403);
    assert.equal(
      (
        await funcionario.post('/api/admin/campanas', {
          nombre: 'No permitida',
          asunto: 'Prueba',
          html: '<p>Hola</p>'
        })
      ).status,
      403
    );

    const admin = await Api.admin(app);
    const resumen = await admin.get('/api/admin/campanas/resumen');
    assert.equal(resumen.status, 200, resumen.body?.error);
    assert.equal(typeof resumen.body.suscripciones.activas, 'number');
  });

  test('crea la campaña en borrador y la envía solo a suscriptores confirmados', async () => {
    await suscribirYConfirmar('campana-uno@ejemplo.mx');
    await suscribirYConfirmar('campana-dos@ejemplo.mx');

    const admin = await Api.admin(app);
    const creada = await admin.post('/api/admin/campanas', {
      nombre: 'Promoción de prueba',
      asunto: 'Conoce el Sistema de Incidencias',
      html: '<p>Hola, ya puedes reportar incidencias en línea.</p>',
      todos: true
    });
    assert.equal(creada.status, 201, creada.body?.error);
    assert.equal(creada.body.campana.estado, 'borrador');

    const id = creada.body.campana.id;
    const enviada = await admin.post(`/api/admin/campanas/${id}/enviar`, {});
    assert.equal(enviada.status, 200, enviada.body?.error);
    assert.equal(enviada.body.campana.estado, 'enviando');

    // En las pruebas el correo es simulado: el proceso termina rápido.
    await campanas.procesarCampana(repositorio, id);

    const detalle = await campanas.detalleCampana(repositorio, { rol: 'admin' }, id);
    assert.equal(detalle.campana.estado, 'enviada');
    assert.ok(detalle.destinatarios.length >= 2);
    assert.ok(detalle.destinatarios.every((d) => d.estado === 'enviado'));
    assert.equal(detalle.campana.enviados, detalle.destinatarios.length);

    const envios = await repositorio.enviosCorreo({ limite: 50 });
    assert.ok(envios.some((e) => e.tipo === 'campana' && e.estado === 'simulado'));

    // No se puede reenviar ni editar una campaña ya enviada.
    assert.equal((await admin.post(`/api/admin/campanas/${id}/enviar`, {})).status, 400);
    assert.equal(
      (
        await admin.put(`/api/admin/campanas/${id}`, {
          nombre: 'Cambio tardío'
        })
      ).status,
      400
    );
  });

  test('la baja en un clic saca al correo del segmento', async () => {
    const suscripcion = await suscribirYConfirmar('baja@ejemplo.mx');

    const publico = new Api(app);
    const baja = await publico.post('/api/publico/suscripciones/baja', {
      token: suscripcion.token
    });
    assert.equal(baja.status, 200, baja.body?.error);
    assert.equal(baja.body.estado, 'baja');

    const guardada = await repositorio.suscripcionPorCorreo('baja@ejemplo.mx');
    assert.equal(guardada.estado, 'baja');

    // Una nueva campaña al municipio ya no lo incluye.
    const admin = await Api.admin(app);
    const creada = await admin.post('/api/admin/campanas', {
      nombre: 'Segmento por municipio',
      asunto: 'Novedades del municipio',
      html: '<p>Novedades</p>',
      segmento: { municipioId: MUNICIPIO_MARAVATIO }
    });
    assert.equal(creada.status, 201, creada.body?.error);
    await admin.post(`/api/admin/campanas/${creada.body.campana.id}/enviar`, {});
    await campanas.procesarCampana(repositorio, creada.body.campana.id);

    const detalle = await campanas.detalleCampana(repositorio, { rol: 'admin' }, creada.body.campana.id);
    assert.ok(!detalle.destinatarios.some((d) => d.correo === 'baja@ejemplo.mx'));
  });

  test('un correo bloqueado no puede suscribirse', async () => {
    const admin = await Api.admin(app);
    const correo = 'bloqueado-campana@ejemplo.mx';
    const bloqueo = await admin.post('/api/admin/bloqueos', {
      correo,
      motivo: 'Solicitudes abusivas'
    });
    assert.equal(bloqueo.status, 201, bloqueo.body?.error);

    const publico = new Api(app);
    const intento = await publico.post('/api/publico/suscripciones', {
      correo,
      aceptaAviso: true
    });
    assert.equal(intento.status, 403);
  });
});
