/** Consentimiento legal: versiones, aceptación y bloqueo de escrituras. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

// El middleware se omite en la suite normal para no repetir la comprobación en
// cada prueba; este archivo la activa para probar el bloqueo real.
process.env.TERMINOS_EXIGIR_EN_PRUEBAS = 'true';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');

let app;
let repositorio;

before(async () => {
  app = crearApp();
  repositorio = await obtenerRepositorio();
});
after(() => entorno.limpiar());

function ticket(extra = {}) {
  return {
    asunto: 'Ticket de prueba de términos',
    cuerpo: 'Descripción suficientemente larga para crear el ticket.',
    ...extra
  };
}

describe('Consentimiento legal versionado', () => {
  test('expone los documentos vigentes y bloquea las acciones sin aceptar', async () => {
    const ciudadano = await Api.ciudadano(app);
    const estado = await ciudadano.get('/api/legal/aceptacion');
    assert.equal(estado.status, 200, estado.body?.error);
    assert.equal(estado.body.aceptada, false);
    assert.equal(estado.body.documentos.length, 2);
    assert.ok(estado.body.documentos.every((documento) => documento.html.length > 20));

    const bloqueado = await ciudadano.post('/api/tickets', ticket());
    assert.equal(bloqueado.status, 428);
    assert.equal(bloqueado.body.detalles.codigo, 'terminos_pendientes');
  });

  test('aceptar los términos habilita la acción y conserva el registro', async () => {
    const ciudadano = await Api.ciudadano(app);
    const estado = await ciudadano.get('/api/legal/aceptacion');
    const aceptada = await ciudadano.post('/api/legal/aceptar', estado.body.versiones);
    assert.equal(aceptada.status, 200, aceptada.body?.error);
    assert.equal(aceptada.body.aceptada, true);

    const creado = await ciudadano.post('/api/tickets', ticket());
    assert.equal(creado.status, 201, creado.body?.error);
    assert.equal(creado.body.ticket.prioridad, 'media');

    const usuario = await repositorio.usuarioPorUsername(
      (await ciudadano.get('/api/auth/me')).body.usuario.username
    );
    const ultima = await repositorio.ultimaAceptacionLegal(usuario.username);
    assert.ok(ultima);
    assert.equal(ultima.versionTerminos, estado.body.versiones.terminos);
    assert.equal(ultima.versionPrivacidad, estado.body.versiones.privacidad);
  });

  test('publicar una versión nueva invalida la aceptación anterior', async () => {
    const admin = await Api.admin(app);
    const estadoAdmin = await admin.get('/api/legal/aceptacion');
    await admin.post('/api/legal/aceptar', estadoAdmin.body.versiones);
    await admin.put('/api/admin/legal/terminos/borrador', {
      titulo: 'Términos y condiciones',
      html: '<h2>Términos actualizados</h2><p>Esta es la nueva versión publicada para la prueba.</p>'
    });
    const publicado = await admin.post('/api/admin/legal/terminos/publicar', {});
    assert.equal(publicado.status, 200, publicado.body?.error);

    const ciudadano = await Api.ciudadano(app);
    const estado = await ciudadano.get('/api/legal/aceptacion');
    const aceptada = await ciudadano.post('/api/legal/aceptar', estado.body.versiones);
    assert.equal(aceptada.status, 200, aceptada.body?.error);

    // Se publica otra versión después de la aceptación del ciudadano.
    const admin2 = await Api.admin(app);
    const estadoAdmin2 = await admin2.get('/api/legal/aceptacion');
    await admin2.post('/api/legal/aceptar', estadoAdmin2.body.versiones);
    await admin2.put('/api/admin/legal/terminos/borrador', {
      titulo: 'Términos y condiciones',
      html: '<h2>Términos actualizados otra vez</h2><p>Otra versión para invalidar la aceptación.</p>'
    });
    await admin2.post('/api/admin/legal/terminos/publicar', {});

    const bloqueado = await ciudadano.post('/api/tickets', ticket({ asunto: 'Ticket tras cambio' }));
    assert.equal(bloqueado.status, 428);
    assert.equal(bloqueado.body.detalles.codigo, 'terminos_pendientes');

    const estadoNuevo = await ciudadano.get('/api/legal/aceptacion');
    assert.equal(estadoNuevo.body.aceptada, false);
    const reaceptada = await ciudadano.post('/api/legal/aceptar', estadoNuevo.body.versiones);
    assert.equal(reaceptada.status, 200, reaceptada.body?.error);
    const creado = await ciudadano.post('/api/tickets', ticket({ asunto: 'Ticket aceptado de nuevo' }));
    assert.equal(creado.status, 201, creado.body?.error);
  });
});
